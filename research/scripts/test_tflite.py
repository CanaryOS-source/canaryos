import tensorflow as tf

interpreter = tf.lite.Interpreter(model_path="canaryapp/assets/models/mobilebert_scam_intent.tflite")
interpreter.allocate_tensors()

print("Inputs:")
for i in interpreter.get_input_details():
    print(f"Name: {i['name']}, Shape: {i['shape']}, Type: {i['dtype']}")

print("Outputs:")
for i in interpreter.get_output_details():
    print(f"Name: {i['name']}, Shape: {i['shape']}, Type: {i['dtype']}")
