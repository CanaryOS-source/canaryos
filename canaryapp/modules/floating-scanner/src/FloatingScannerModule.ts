import { NativeModule, requireNativeModule } from 'expo';

import { FloatingScannerModuleEvents } from './FloatingScanner.types';

declare class FloatingScannerModule extends NativeModule<FloatingScannerModuleEvents> {
  PI: number;
  hello(): string;
  setValueAsync(value: string): Promise<void>;
}

// This call loads the native module object from the JSI.
export default requireNativeModule<FloatingScannerModule>('FloatingScanner');
