"use strict";

const Iconv = require("iconv-lite");
const Utils = require("../misc/utils");

const QUOTE = 0x27;
const DBL_QUOTE = 0x22;
const ZERO_BYTE = 0x00;
const SLASH = 0x5c;

//increase by level to avoid buffer copy.
const SMALL_BUFFER_SIZE = 2048;
const MEDIUM_BUFFER_SIZE = 131072; //128k
const LARGE_BUFFER_SIZE = 1048576; //1M
const MAX_BUFFER_SIZE = 16777219; //16M + 4

/**
 * MySQL packet builder.
 *
 * @param opts    options
 * @param info    connection info
 * @constructor
 */
function PacketOutputStream(opts, info) {
  this.opts = opts;
  this.info = info;
  this.pos = 4;
  this.smallBuffer = Buffer.allocUnsafe(SMALL_BUFFER_SIZE);
  this.buf = this.smallBuffer;
  this.writeDate = opts.timezone === "local" ? this.writeLocalDate : this.writeTimezoneDate;
}

PacketOutputStream.prototype.setWriter = function(writer) {
  this.writer = writer;
};

PacketOutputStream.prototype.growBuffer = function(len) {
  let newCapacity;
  if (len + this.pos < MEDIUM_BUFFER_SIZE) {
    newCapacity = MEDIUM_BUFFER_SIZE;
  } else if (len + this.pos < LARGE_BUFFER_SIZE) {
    newCapacity = LARGE_BUFFER_SIZE;
  } else newCapacity = this.getMaxPacketLength();

  let newBuf = Buffer.allocUnsafe(newCapacity);
  this.buf.copy(newBuf, 0, 0, this.pos);
  this.buf = newBuf;
};

PacketOutputStream.prototype.startPacket = function(cmd) {
  this.cmd = cmd;
  this.pos = 4;
};

PacketOutputStream.prototype.writeInt8 = function(value) {
  if (this.pos + 1 >= this.buf.length) {
    if (this.pos >= this.getMaxPacketLength()) {
      //buffer is more than a Packet, must flushBuffer()
      this.flushBuffer(false);
    } else this.growBuffer(1);
  }
  this.buf[this.pos++] = value;
};

PacketOutputStream.prototype.writeInt16 = function(value) {
  if (this.pos + 2 >= this.buf.length) {
    let b = Buffer.allocUnsafe(2);
    b.writeUInt16LE(value, 0);
    this.writeBuffer(b, 0, 2);
    return;
  }
  this.buf.writeUInt16LE(value, this.pos);
  this.pos += 2;
};

PacketOutputStream.prototype.writeInt32 = function(value) {
  if (this.pos + 4 >= this.buf.length) {
    //not enough space remaining
    let arr = Buffer.allocUnsafe(4);
    arr.writeInt32LE(value, 0);
    this.writeBuffer(arr, 0, 4);
    return;
  }

  this.buf.writeInt32LE(value, this.pos);
  this.pos += 4;
};

PacketOutputStream.prototype.writeLengthCoded = function(len) {
  if (len < 0xfb) {
    this.writeInt8(len);
    return;
  }

  if (len < 0xffff) {
    this.writeInt8(0xfc);
    this.writeInt16(len);
    return;
  }

  if (len < 0xffffff) {
    this.writeInt8(0xfd);
    this.writeInt24(len);
    return;
  }

  if (len === null) {
    this.writeInt8(0xfb);
    return;
  }

  this.writeInt8(0xfe);
  this.buffer.writeUInt32LE(len, this.pos);
  this.buffer.writeUInt32LE(len >> 32, this.pos + 4);
  this.pos += 8;
};

PacketOutputStream.prototype.writeLocalDate = function(date, opts) {
  const year = date.getFullYear();
  const mon = date.getMonth() + 1;
  const day = date.getDate();
  const hour = date.getHours();
  const min = date.getMinutes();
  const sec = date.getSeconds();
  const ms = date.getMilliseconds();
  this._writeDatePart(year, mon, day, hour, min, sec, ms);
};

PacketOutputStream.prototype._writeDatePart = function(year, mon, day, hour, min, sec, ms) {
  //return 'YYYY-MM-DD HH:MM:SS' datetime format
  //see https://mariadb.com/kb/en/library/datetime/
  this.writeStringAscii(
    (year > 999 ? year : year > 99 ? "0" + year : year > 9 ? "00" + year : "000" + year) +
      "-" +
      (mon < 10 ? "0" : "") +
      mon +
      "-" +
      (day < 10 ? "0" : "") +
      day +
      " " +
      (hour < 10 ? "0" : "") +
      hour +
      ":" +
      (min < 10 ? "0" : "") +
      min +
      ":" +
      (sec < 10 ? "0" : "") +
      sec +
      "." +
      (ms > 99 ? ms : ms > 9 ? "0" + ms : "00" + ms)
  );
};

PacketOutputStream.prototype.writeTimezoneDate = function(date, opts) {
  if (opts.timezoneMillisOffset) date.setTime(date.getTime() + opts.timezoneMillisOffset);

  const year = date.getUTCFullYear();
  const mon = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const hour = date.getUTCHours();
  const min = date.getUTCMinutes();
  const sec = date.getUTCSeconds();
  const ms = date.getUTCMilliseconds();
  this._writeDatePart(year, mon, day, hour, min, sec, ms);
};

PacketOutputStream.prototype.writeLengthCodedBuffer = function(arr) {
  this.writeLengthCoded(arr.length);
  this.writeBuffer(arr, 0, arr.length);
};

PacketOutputStream.prototype.writeBuffer = function(arr, off, len) {
  if (len > this.buf.length - this.pos) {
    if (this.buf.length !== this.getMaxPacketLength()) {
      this.growBuffer(len);
    }

    //max buffer size
    if (len > this.buf.length - this.pos) {
      //not enough space in buffer, will stream :
      // fill buffer and flush until all data are snd
      let remainingLen = len;
      do {
        let lenToFillBuffer = Math.min(this.getMaxPacketLength() - this.pos, remainingLen);

        arr.copy(this.buf, this.pos, off, lenToFillBuffer);

        remainingLen -= lenToFillBuffer;
        off += lenToFillBuffer;
        this.pos += lenToFillBuffer;
        if (remainingLen > 0) {
          this.flushBuffer(false);
        } else {
          break;
        }
      } while (true);
      return;
    }
  }

  arr.copy(this.buf, this.pos, off, len);
  this.pos += len;
};

/**
 * Write ascii string to socket (no escaping)
 *
 * @param str                string
 */
PacketOutputStream.prototype.writeStringAscii = function writeStringAscii(str) {
  let len = str.length;

  //not enough space remaining
  if (len >= this.buf.length - this.pos) {
    let strBuf = Buffer.from(str, "ascii");
    this.writeBuffer(strBuf, 0, strBuf.length);
    return;
  }

  for (let off = 0; off < len; ) {
    this.buf[this.pos++] = str.charCodeAt(off++);
  }
};

PacketOutputStream.prototype.writeString = function(str, encoding) {
  if (!encoding) encoding = this.opts.collation.encoding;

  if (Buffer.isEncoding(encoding)) {
    //javascript use UCS-2 or UTF-16 string internal representation
    //that means that string to byte will be a maximum of * 3
    // (4 bytes utf-8 are represented on 2 UTF-16 characters)
    if (str.length * 3 < this.buf.length - this.pos) {
      this.pos += this.buf.write(str, this.pos, encoding);
      return;
    }

    //checking real length
    let byteLength = Buffer.byteLength(str, encoding);
    if (byteLength > this.buf.length - this.pos) {
      if (this.buf.length < this.getMaxPacketLength()) {
        this.growBuffer(byteLength);
      }
      if (byteLength > this.buf.length - this.pos) {
        //not enough space in buffer, will stream :
        let strBuf = Buffer.from(str, encoding);
        this.writeBuffer(strBuf, 0, strBuf.length);
        return;
      }
    }
    this.pos += this.buf.write(str, this.pos, encoding);
    return;
  }

  let buf = Iconv.decode(str, encoding);
  this.writeBuffer(buf, 0, buf.length);
};

const CHARS_GLOBAL_REGEXP = /[\0\"\'\\]/g; // eslint-disable-line no-control-regex

/**
 * Parameters need to be properly escaped :
 * following characters are to be escaped by "\" :
 * - \0
 * - \\
 * - \'
 * - \"
 * regex split part of string writing part, and escaping special char.
 * Those chars are <= 7f meaning that this will work even with multi-byte encoding
 *
 * @param str string to escape.
 */
PacketOutputStream.prototype.writeStringEscape = function(str) {
  let match;
  let lastIndex = 0;
  while ((match = CHARS_GLOBAL_REGEXP.exec(str)) !== null) {
    this.writeString(str.slice(lastIndex, match.index));
    this.writeInt8(SLASH);
    this.writeInt8(match[0].charCodeAt(0));
    lastIndex = CHARS_GLOBAL_REGEXP.lastIndex;
  }

  if (lastIndex === 0) {
    // Nothing was escaped
    this.writeString(str);
    return;
  }

  if (lastIndex < str.length) {
    this.writeString(str.slice(lastIndex));
  }
};

PacketOutputStream.prototype.writeBufferEscape = function(val) {
  let valLen = val.length;
  if (valLen * 2 > this.buf.length - this.pos) {
    //makes buffer bigger (up to 16M)
    if (this.buf.length !== this.getMaxPacketLength()) this.growBuffer(valLen * 2);

    //data may still be bigger than buffer.
    //must flush buffer when full (and reset position to 4)
    if (valLen * 2 > this.buf.length - this.pos) {
      //not enough space in buffer, will fill buffer
      for (let i = 0; i < valLen; i++) {
        switch (val[i]) {
          case QUOTE:
          case SLASH:
          case DBL_QUOTE:
          case ZERO_BYTE:
            if (this.pos >= this.buf.length) this.flushBuffer(false);
            this.buf[this.pos++] = SLASH; //add escape slash
        }
        if (this.pos >= this.buf.length) this.flushBuffer(false);
        this.buf[this.pos++] = val[i];
      }
      return;
    }
  }

  //sure to have enough place to use buffer directly
  for (let i = 0; i < valLen; i++) {
    switch (val[i]) {
      case QUOTE:
      case SLASH:
      case DBL_QUOTE:
      case ZERO_BYTE:
        this.buf[this.pos++] = SLASH; //add escape slash
    }
    this.buf[this.pos++] = val[i];
  }
};

/**
 * Flush the internal buffer.
 */
PacketOutputStream.prototype.flushBuffer = function(commandEnd) {
  this.buf[0] = this.pos - 4;
  this.buf[1] = (this.pos - 4) >>> 8;
  this.buf[2] = (this.pos - 4) >>> 16;
  this.buf[3] = this.cmd.sequenceNo;
  this.cmd.incrementSequenceNo(1);

  if (this.opts.debug) {
    console.log(
      "==> conn:%d %s\n%s",
      this.info.threadId ? this.info.threadId : -1,
      (this.cmd.onPacketReceive
        ? this.cmd.constructor.name + "." + this.cmd.onPacketReceive.name
        : this.cmd.constructor.name) +
        "(0," +
        this.pos +
        ")",
      Utils.log(this.buf, 0, this.pos)
    );
  }

  this.writer(this.buf.slice(0, this.pos));

  if (commandEnd) {
    //if last com fill the max size, must send an empty com to indicate command end.
    if (this.pos === this.getMaxPacketLength()) this.writeEmptyPacket();

    //reset buffer
    this.buf = this.smallBuffer;
  }

  this.pos = 4;
};

PacketOutputStream.prototype.writeEmptyPacket = function() {
  this.buf[0] = 0x00;
  this.buf[1] = 0x00;
  this.buf[2] = 0x00;
  this.buf[3] = this.cmd.sequenceNo;
  this.cmd.incrementSequenceNo(1);

  this.writer(this.buf.from(0, 0, 4));

  if (this.opts.debug) {
    console.log(
      "==> conn:%d %s\n%s",
      this.info.threadId ? this.info.threadId : -1,
      (this.cmd.onPacketReceive
        ? this.cmd.constructor.name + "." + this.cmd.onPacketReceive.name
        : this.cmd.constructor.name) + "(0,4)",
      Utils.log(this.buf, 0, 4)
    );
  }
};

PacketOutputStream.prototype.getMaxPacketLength = function() {
  return MAX_BUFFER_SIZE;
};

module.exports = PacketOutputStream;
