import * as React from 'react';

import { FloatingScannerViewProps } from './FloatingScanner.types';

export default function FloatingScannerView(props: FloatingScannerViewProps) {
  return (
    <div>
      <iframe
        style={{ flex: 1 }}
        src={props.url}
        onLoad={() => props.onLoad({ nativeEvent: { url: props.url } })}
      />
    </div>
  );
}
