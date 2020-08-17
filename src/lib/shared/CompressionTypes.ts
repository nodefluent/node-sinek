"use strict";

const TYPES = [0, 1, 2];

class CompressionTypes {

  public NONE: number;
  public GZIP: number;
  public SNAPPY: number;

  constructor() {
    this.NONE = 0;
    this.GZIP = 1;
    this.SNAPPY = 2;
  }

  isValid(type) {

    if (typeof type !== "number") {
      return false;
    }

    return TYPES.indexOf(type) !== -1;
  }
}

export default new CompressionTypes();
