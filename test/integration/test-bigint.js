"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("integer with big value", function() {
  var conn = null;
  before(function(done) {
    shareConn.query(
      "CREATE TEMPORARY TABLE testBigint (v BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY)",
      err => {
        if (err) return done(err);
        done();
      }
    );
  });

  after(function() {
    if (conn) conn.end();
  });

  it("bigint format", function(done) {
    shareConn.query("INSERT INTO testBigint values (127), (128)", (err, rows) => {
      assert.strictEqual(rows.insertId, 128);
    });
    shareConn.query("INSERT INTO testBigint values (9007199254740991)", (err, rows) => {
      assert.strictEqual(rows.insertId, 9007199254740991);
    });
    shareConn.query("INSERT INTO testBigint values ()", (err, rows) => {
      assert.strictEqual(rows.insertId.toNumber(), 9007199254740992);
    });
    shareConn.query("SELECT * FROM testBigint", (err, rows) => {
      assert.strictEqual(rows.length, 4);
      assert.strictEqual(rows[0].v, 127);
      assert.strictEqual(rows[1].v, 128);
      assert.strictEqual(rows[2].v, 9007199254740991);
      //when not option bigNumberStrings and supportBigNumbers
      assert.strictEqual(rows[3].v, 9007199254740992);
      assert.strictEqual(typeof rows[3].v, "number");

      done();
    });
  });
});
