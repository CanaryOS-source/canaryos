import { requireNativeView } from 'expo';
import * as React from 'react';

import { FloatingScannerViewProps } from './FloatingScanner.types';

const NativeView: React.ComponentType<FloatingScannerViewProps> =
  requireNativeView('FloatingScanner');

export default function FloatingScannerView(props: FloatingScannerViewProps) {
  return <NativeView {...props} />;
}
