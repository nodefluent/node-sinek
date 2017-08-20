"use strict";

const TYPES = [0,1,2];

class CompressionTypes {

  constructor(){
    this.NONE = 0;
    this.GZIP = 1;
    this.SNAPPY = 2;
  }

  isValid(type){

    if(typeof type !== "number"){
      return false;
    }

    return TYPES.indexOf(type) !== -1;
  }
}

module.exports = new CompressionTypes();
