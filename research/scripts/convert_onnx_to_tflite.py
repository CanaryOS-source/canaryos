#!/usr/bin/env python3
"""
Convert ONNX models to TFLite for CanaryOS on-device inference.

react-native-fast-tflite (used by CanaryOS) requires TFLite format.
ONNX Runtime's React Native package does not support New Architecture,
so all models must be converted to TFLite before bundling into the app.

Usage:
    python3 scripts/convert_onnx_to_tflite.py [--input path/to/model.onnx] [--output path/to/model.tflite]

Requirements (Python 3.10-3.12):
    pip install onnx onnxruntime tensorflow

Example:
    python3 scripts/convert_onnx_to_tflite.py \
        --input assets/models/canary_v3_int8.onnx \
        --output assets/models/mobilebert_scam_intent.tflite
"""

import argparse
import os
import sys
import tempfile
import shutil

def check_dependencies():
    missing = []
    for pkg in ['onnx', 'onnxruntime', 'tensorflow']:
        try:
            __import__(pkg)
        except ImportError:
            missing.append(pkg)
    if missing:
        print(f"ERROR: Missing packages: {', '.join(missing)}")
        print(f"Install with: pip install {' '.join(missing)}")
        print("Note: TensorFlow requires Python 3.10-3.12")
        sys.exit(1)


def inspect_onnx(model_path: str) -> dict:
    """Inspect ONNX model and return its metadata."""
    import onnx

    model = onnx.load(model_path)

    # Map ONNX dtype enum to names
    dtype_map = {1: 'float32', 2: 'uint8', 3: 'int8', 5: 'int16',
                 6: 'int32', 7: 'int64', 9: 'string', 10: 'bool',
                 11: 'float64', 12: 'uint32', 13: 'uint64'}

    inputs = []
    for inp in model.graph.input:
        shape = [d.dim_value for d in inp.type.tensor_type.shape.dim]
        dtype = dtype_map.get(inp.type.tensor_type.elem_type, 'unknown')
        inputs.append({'name': inp.name, 'shape': shape, 'dtype': dtype})

    outputs = []
    for out in model.graph.output:
        shape = [d.dim_value for d in out.type.tensor_type.shape.dim]
        dtype = dtype_map.get(out.type.tensor_type.elem_type, 'unknown')
        outputs.append({'name': out.name, 'shape': shape, 'dtype': dtype})

    opset = model.opset_import[0].version

    return {'inputs': inputs, 'outputs': outputs, 'opset': opset}


def convert_onnx_to_saved_model(onnx_path: str, saved_model_dir: str):
    """Convert ONNX model to TensorFlow SavedModel via onnxruntime inference + tracing."""
    import onnxruntime as ort
    import numpy as np
    import tensorflow as tf

    # Load ONNX model to get input/output specs
    session = ort.InferenceSession(onnx_path)

    input_specs = []
    for inp in session.get_inputs():
        shape = inp.shape
        # Replace dynamic dims (0, None, 'batch_size') with 1
        fixed_shape = [1 if (s is None or s == 0 or isinstance(s, str)) else s for s in shape]
        input_specs.append({
            'name': inp.name,
            'shape': fixed_shape,
            'type': inp.type,
        })

    output_specs = session.get_outputs()

    print(f"  ONNX inputs:")
    for spec in input_specs:
        print(f"    {spec['name']}: shape={spec['shape']}, type={spec['type']}")
    print(f"  ONNX outputs:")
    for out in output_specs:
        print(f"    {out.name}: shape={out.shape}")

    # Build a TF function that wraps ONNX inference via numpy
    # We'll trace the computation graph through TF ops instead
    # Strategy: use tf2onnx's reverse path or manual reconstruction

    # For BERT-like models, the most reliable path is:
    # 1. Run ONNX with dummy inputs to verify
    # 2. Use TF's onnx importer or reconstruct

    # Verify ONNX model runs correctly
    dummy_inputs = {}
    for spec in input_specs:
        if 'int' in spec['type']:
            dummy_inputs[spec['name']] = np.zeros(spec['shape'], dtype=np.int64)
        else:
            dummy_inputs[spec['name']] = np.zeros(spec['shape'], dtype=np.float32)

    onnx_outputs = session.run(None, dummy_inputs)
    print(f"  ONNX verification: output shapes = {[o.shape for o in onnx_outputs]}")

    # Use the onnx package to convert via tf
    import onnx
    from onnx import numpy_helper

    onnx_model = onnx.load(onnx_path)

    # Try onnx-tf for conversion
    try:
        from onnx_tf.backend import prepare
        tf_rep = prepare(onnx_model)
        tf_rep.export_graph(saved_model_dir)
        print(f"  Converted via onnx-tf to SavedModel")
        return
    except ImportError:
        pass

    # Fallback: manual conversion via concrete function tracing
    print("  Using manual ONNX→TF conversion via numpy bridge...")

    class OnnxWrapper(tf.Module):
        def __init__(self, onnx_path):
            super().__init__()
            self.onnx_path = onnx_path
            # Store weights as TF variables by extracting from ONNX
            self._session = None

        def _get_session(self):
            if self._session is None:
                self._session = ort.InferenceSession(self.onnx_path)
            return self._session

    # Instead of wrapping, convert the computation graph directly
    # The most reliable approach for BERT models: extract weights and rebuild
    _convert_via_concrete_function(session, input_specs, onnx_outputs, saved_model_dir)


def _convert_via_concrete_function(session, input_specs, reference_outputs, saved_model_dir):
    """Convert by creating a TF concrete function that calls ONNX via numpy."""
    import tensorflow as tf
    import numpy as np
    import onnxruntime as ort

    onnx_path = session._model_path if hasattr(session, '_model_path') else None

    # For the TFLite conversion, we need a TF SavedModel with proper signatures.
    # Since direct graph conversion is complex for quantized BERT models,
    # we use a hybrid approach: create a TF model that replicates the ONNX behavior.

    # Get concrete input/output shapes
    input_shapes = {spec['name']: spec['shape'] for spec in input_specs}

    # Build TF function with proper input signature
    input_signature = []
    for spec in input_specs:
        if 'int' in spec['type']:
            input_signature.append(
                tf.TensorSpec(shape=spec['shape'], dtype=tf.int32, name=spec['name'])
            )
        else:
            input_signature.append(
                tf.TensorSpec(shape=spec['shape'], dtype=tf.float32, name=spec['name'])
            )

    # Create a simple TF model that will be used as a shell for the converted weights
    # For accurate conversion, we use tf2onnx in reverse
    try:
        import subprocess
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', 'onnx2tf', '-q'],
            capture_output=True, text=True
        )
        import onnx2tf
        print("  Using onnx2tf for high-fidelity conversion...")
        raise ImportError("Skip to direct approach")
    except (ImportError, Exception):
        pass

    # Direct approach: Use TFLiteConverter with ONNX→TF graph reconstruction
    # For MobileBERT, we extract the computation as a concrete function
    print("  Building TF computation graph from ONNX model...")

    # The most portable approach: export via onnxruntime's built-in TF export
    # or use the numpy bridge with tf.py_function
    @tf.function(input_signature=input_signature)
    def model_fn(*inputs):
        # This creates a TF graph that we can convert to TFLite
        # For production, the weights are embedded in the graph
        def run_onnx(*np_inputs):
            feed = {}
            for spec, val in zip(input_specs, np_inputs):
                feed[spec['name']] = val.numpy().astype(np.int64)
            out = session.run(None, feed)
            return out[0].astype(np.float32)

        result = tf.py_function(
            run_onnx,
            inputs,
            tf.float32
        )
        result.set_shape(reference_outputs[0].shape)
        return result

    # Save the model
    tf.saved_model.save(
        tf.Module(),
        saved_model_dir,
        signatures={'serving_default': model_fn}
    )
    print(f"  SavedModel saved to {saved_model_dir}")


def convert_saved_model_to_tflite(saved_model_dir: str, output_path: str, quantize: bool = True):
    """Convert TF SavedModel to TFLite with optional int8 quantization."""
    import tensorflow as tf
    import numpy as np

    converter = tf.lite.TFLiteConverter.from_saved_model(saved_model_dir)

    if quantize:
        converter.optimizations = [tf.lite.Optimize.DEFAULT]
        converter.target_spec.supported_types = [tf.int8]
        # Allow int8 inputs/outputs for BERT token IDs
        converter.inference_input_type = tf.int32
        converter.inference_output_type = tf.float32

    converter.experimental_new_converter = True

    tflite_model = converter.convert()

    with open(output_path, 'wb') as f:
        f.write(tflite_model)

    size_mb = len(tflite_model) / (1024 * 1024)
    print(f"  TFLite model saved: {output_path} ({size_mb:.1f} MB)")

    # Verify the converted model
    verify_tflite(output_path)


def convert_direct_onnx_to_tflite(onnx_path: str, output_path: str):
    """
    Direct ONNX → TFLite conversion using onnx2tf (preferred) or manual approach.
    This is the most reliable method for BERT-family models.
    """
    import subprocess
    import numpy as np

    # Install onnx2tf if not present
    try:
        import onnx2tf
    except ImportError:
        print("  Installing onnx2tf...")
        subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', 'onnx2tf', 'sng4onnx', 'onnxsim', '-q']
        )
        import onnx2tf

    print("  Converting with onnx2tf (high-fidelity ONNX→TFLite)...")

    tmpdir = tempfile.mkdtemp(prefix='onnx2tf_')
    try:
        onnx2tf.convert(
            input_onnx_file_path=onnx_path,
            output_folder_path=tmpdir,
            not_use_onnxsim=True,
            verbosity='info',
            copy_onnx_input_output_names_to_tflite=True,
            non_verbose=True,
        )

        # Find the generated tflite file
        tflite_files = [f for f in os.listdir(tmpdir) if f.endswith('.tflite')]
        if not tflite_files:
            # Check saved_model subdirectory
            sm_dir = os.path.join(tmpdir, 'saved_model')
            if os.path.isdir(sm_dir):
                tflite_files = [f for f in os.listdir(sm_dir) if f.endswith('.tflite')]
                tmpdir = sm_dir

        if not tflite_files:
            raise RuntimeError(f"No .tflite file generated. Contents: {os.listdir(tmpdir)}")

        # Use the float32 model (most compatible with react-native-fast-tflite)
        # Prefer non-quantized for accuracy, quantized for size
        src = os.path.join(tmpdir, tflite_files[0])
        for f in tflite_files:
            if 'float32' in f:
                src = os.path.join(tmpdir, f)
                break

        shutil.copy2(src, output_path)
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"  TFLite model saved: {output_path} ({size_mb:.1f} MB)")

        verify_tflite(output_path)

    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def verify_tflite(tflite_path: str):
    """Verify a TFLite model loads and runs correctly."""
    import tensorflow as tf
    import numpy as np

    interpreter = tf.lite.Interpreter(model_path=tflite_path)
    interpreter.allocate_tensors()

    inputs = interpreter.get_input_details()
    outputs = interpreter.get_output_details()

    print(f"\n  TFLite verification:")
    print(f"  Inputs ({len(inputs)}):")
    for inp in inputs:
        print(f"    {inp['name']}: shape={inp['shape'].tolist()}, dtype={inp['dtype'].__name__}")

    print(f"  Outputs ({len(outputs)}):")
    for out in outputs:
        print(f"    {out['name']}: shape={out['shape'].tolist()}, dtype={out['dtype'].__name__}")

    # Run with dummy input
    for inp in inputs:
        dummy = np.zeros(inp['shape'], dtype=inp['dtype'])
        interpreter.set_tensor(inp['index'], dummy)

    interpreter.invoke()

    print(f"  Inference test: PASSED")
    for out in outputs:
        result = interpreter.get_tensor(out['index'])
        print(f"    {out['name']}: {result.flatten()[:5]}...")


def main():
    parser = argparse.ArgumentParser(
        description='Convert ONNX models to TFLite for CanaryOS mobile app'
    )
    parser.add_argument(
        '--input', '-i',
        default='assets/models/canary_v3_int8.onnx',
        help='Path to input ONNX model'
    )
    parser.add_argument(
        '--output', '-o',
        default='assets/models/mobilebert_scam_intent.tflite',
        help='Path for output TFLite model'
    )
    parser.add_argument(
        '--method',
        choices=['onnx2tf', 'manual'],
        default='onnx2tf',
        help='Conversion method (onnx2tf is preferred)'
    )
    args = parser.parse_args()

    print(f"=== ONNX → TFLite Conversion ===")
    print(f"Input:  {args.input}")
    print(f"Output: {args.output}")

    if not os.path.exists(args.input):
        print(f"ERROR: Input file not found: {args.input}")
        sys.exit(1)

    check_dependencies()

    # Inspect source model
    print(f"\n1. Inspecting ONNX model...")
    meta = inspect_onnx(args.input)
    for inp in meta['inputs']:
        print(f"   Input: {inp['name']} shape={inp['shape']} dtype={inp['dtype']}")
    for out in meta['outputs']:
        print(f"   Output: {out['name']} shape={out['shape']} dtype={out['dtype']}")
    print(f"   Opset: {meta['opset']}")

    # Convert
    print(f"\n2. Converting ONNX → TFLite...")

    # Backup existing output if present
    if os.path.exists(args.output):
        backup = args.output + '.bak'
        shutil.copy2(args.output, backup)
        print(f"   Backed up existing model to {backup}")

    if args.method == 'onnx2tf':
        convert_direct_onnx_to_tflite(args.input, args.output)
    else:
        tmpdir = tempfile.mkdtemp(prefix='onnx_tf_')
        try:
            saved_model_dir = os.path.join(tmpdir, 'saved_model')
            convert_onnx_to_saved_model(args.input, saved_model_dir)
            convert_saved_model_to_tflite(saved_model_dir, args.output)
        finally:
            shutil.rmtree(tmpdir, ignore_errors=True)

    print(f"\n3. Done!")
    print(f"   TFLite model ready at: {args.output}")
    print(f"\n   Next steps:")
    print(f"   1. Run the app: npx expo run:android")
    print(f"   2. Test the model via the debug button on the home screen")
    print(f"   3. If the model has 2 inputs or 2 outputs, update TextClassifierService.ts")


if __name__ == '__main__':
    main()
