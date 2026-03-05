import React from 'react';
import { QrReader as BaseQrReader } from 'react-qr-reader';

if (typeof BaseQrReader === 'function' && BaseQrReader.defaultProps) {
  try {
    delete BaseQrReader.defaultProps;
  } catch {
    BaseQrReader.defaultProps = undefined;
  }
}

const StableQrReader = (props) => <BaseQrReader {...props} />;

export default StableQrReader;