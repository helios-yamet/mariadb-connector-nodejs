"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("Error", () => {
  it("query error with trace", function(done) {
    base
      .createConnection({ trace: true })
      .then(conn => {
        conn
          .query("wrong query")
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.isTrue(err.stack.includes("test-error.js"));
            assert.isTrue(err != null);
            assert.isTrue(err.message.includes("You have an error in your SQL syntax"));
            assert.isTrue(err.message.includes("sql: wrong query - parameters:[]"));
            assert.equal(err.errno, 1064);
            assert.equal(err.sqlState, 42000);
            assert.equal(err.code, "ER_PARSE_ERROR");
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query error without trace", function(done) {
    base
      .createConnection({ trace: false })
      .then(conn => {
        conn
          .query("wrong query")
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.isFalse(err.stack.includes("test-error.js"));
            assert.isTrue(err != null);
            assert.isTrue(err.message.includes("You have an error in your SQL syntax"));
            assert.isTrue(err.message.includes("sql: wrong query - parameters:[]"));
            assert.equal(err.errno, 1064);
            assert.equal(err.sqlState, 42000);
            assert.equal(err.code, "ER_PARSE_ERROR");
            conn.end();
            done();
          });
      })
      .catch(done);
  });

  it("query after connection ended", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .end()
          .then(() => {
            return conn.query("DO 1");
          })
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.isTrue(err != null);
            assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
            assert.isTrue(err.message.includes("sql: DO 1 - parameters:[]"));
            assert.isTrue(err.fatal);
            assert.equal(err.sqlState, "08S01");
            assert.equal(err.code, "ER_CMD_CONNECTION_CLOSED");
            conn
              .query("DO 1")
              .then(() => {
                done(new Error("must have thrown error !"));
              })
              .catch(err => {
                assert.isTrue(err != null);
                assert.isTrue(
                  err.message.includes("Cannot execute new commands: connection closed")
                );
                assert.isTrue(err.message.includes("sql: DO 1 - parameters:[]"));
                assert.isTrue(err.fatal);
                assert.equal(err.sqlState, "08S01");
                assert.equal(err.code, "ER_CMD_CONNECTION_CLOSED");
                done();
              });
          });
      })
      .catch(done);
  });

  it("transaction after connection ended", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .end()
          .then(() => {
            return conn.beginTransaction();
          })
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.isTrue(err != null);
            assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
            assert.isTrue(err.message.includes("sql: START TRANSACTION - parameters:[]"));
            assert.isTrue(err.fatal);
            assert.equal(err.sqlState, "08S01");
            assert.equal(err.code, "ER_CMD_CONNECTION_CLOSED");
            done();
          });
      })
      .catch(done);
  });

  it("server close connection without warning", function(done) {
    this.timeout(20000);
    let connectionErr = false;
    base
      .createConnection()
      .then(conn => {
        conn.query("set @@wait_timeout = 1");
        conn.on("error", err => {
          assert.isTrue(err.message.includes("socket has unexpectedly been closed"));
          assert.equal(err.sqlState, "08S01");
          assert.equal(err.code, "ER_SOCKET_UNEXPECTED_CLOSE");
          connectionErr = true;
        });
        setTimeout(function() {
          conn
            .query("SELECT 2")
            .then(() => {
              done(new Error("must have thrown error !"));
            })
            .catch(err => {
              assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
              assert.equal(err.sqlState, "08S01");
              assert.equal(err.code, "ER_CMD_CONNECTION_CLOSED");
              assert.isTrue(connectionErr);
              done();
            });
        }, 2000);
      })
      .catch(done);
  });

  it("server close connection - no connection error event", function(done) {
    this.timeout(20000);

    // Remove Mocha's error listener
    const originalException = process.listeners("uncaughtException").pop();
    process.removeListener("uncaughtException", originalException);

    // Add your own error listener to check for unhandled exceptions
    process.once("uncaughtException", function(err) {
      const recordedError = err;

      process.nextTick(function() {
        process.listeners("uncaughtException").push(originalException);
        assert.isTrue(recordedError.message.includes("socket has unexpectedly been closed"));
        done();
      });
    });

    base
      .createConnection()
      .then(conn => {
        conn.query("set @@wait_timeout = 1");
        setTimeout(function() {
          conn
            .query("SELECT 2")
            .then(() => {
              done(new Error("must have thrown error !"));
            })
            .catch(err => {
              assert.isTrue(err.message.includes("Cannot execute new commands: connection closed"));
              assert.equal(err.sqlState, "08S01");
              assert.equal(err.code, "ER_CMD_CONNECTION_CLOSED");
            });
        }, 2000);
      })
      .catch(done);
  });

  it("server close connection during query", function(done) {
    this.timeout(20000);
    base
      .createConnection()
      .then(conn => {
        conn.on("error", err => {});
        conn
          .query("SELECT SLEEP(5)")
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.isTrue(err.message.includes("socket has unexpectedly been closed"));
            assert.equal(err.sqlState, "08S01");
            assert.equal(err.code, "ER_SOCKET_UNEXPECTED_CLOSE");
            done();
          });
        setTimeout(function() {
          shareConn.query("KILL " + conn.threadId);
        }, 20);
      })
      .catch(done);
  });

  it("end connection query error", function(done) {
    base
      .createConnection()
      .then(conn => {
        conn
          .query(
            "select * from information_schema.columns as c1,  information_schema.tables, information_schema.tables as t2"
          )
          .then(() => {
            done(new Error("must have thrown error !"));
          })
          .catch(err => {
            assert.ok(err.message.includes("close forced"));
            done();
          });
        setTimeout(
          conn.__tests.getSocket().destroy.bind(conn.__tests.getSocket(), new Error("close forced"))
        );
      })
      .catch(done);
  });

  it("query parameters logged in error", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 1146);
      assert.equal(err.sqlState, "42S02");
      assert.equal(err.code, "ER_NO_SUCH_TABLE");
      assert.isFalse(err.fatal);
      assert.isTrue(
        err.message.includes(
          "sql: INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?)  - parameters:[1,0x01ff,'hh','01/01/2001 00:00:00.000',null]"
        )
      );
    };

    shareConn
      .query("INSERT INTO falseTable(t1, t2, t3, t4, t5) values (?, ?, ?, ?, ?) ", [
        1,
        Buffer.from([0x01, 0xff]),
        "hh",
        new Date(2001, 0, 1, 0, 0, 0),
        null
      ])
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(handleResult);

    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("query undefined parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45017);
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.code, "ER_PARAMETER_UNDEFINED");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Parameter at position 2 is undefined\n" +
            "sql: INSERT INTO undefinedParameter values (?, ?, ?) - parameters:[1,undefined,3]"
        )
      );
    };

    shareConn.query("CREATE TEMPORARY TABLE undefinedParameter (id int, id2 int, id3 int)");
    shareConn
      .query("INSERT INTO undefinedParameter values (?, ?, ?)", [1, undefined, 3])
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(handleResult);

    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("query missing parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45016);
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.code, "ER_MISSING_PARAMETER");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Parameter at position 3 is not set\n" +
            "sql: INSERT INTO execute_missing_parameter values (?, ?, ?) - parameters:[1,3]"
        )
      );
    };
    shareConn.query("CREATE TEMPORARY TABLE execute_missing_parameter (id int, id2 int, id3 int)");
    shareConn
      .query("INSERT INTO execute_missing_parameter values (?, ?, ?)", [1, 3])
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(handleResult);
    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("query no parameter", function(done) {
    const handleResult = function(err) {
      assert.equal(err.errno, 45016);
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.code, "ER_MISSING_PARAMETER");
      assert.isFalse(err.fatal);
      assert.ok(
        err.message.includes(
          "Parameter at position 1 is not set\n" +
            "sql: INSERT INTO execute_no_parameter values (?, ?, ?) - parameters:[]"
        )
      );
    };
    shareConn.query("CREATE TEMPORARY TABLE execute_no_parameter (id int, id2 int, id3 int)");
    shareConn
      .query("INSERT INTO execute_no_parameter values (?, ?, ?)", [])
      .then(() => {
        done(new Error("must have thrown error !"));
      })
      .catch(handleResult);
    shareConn
      .query("SELECT 1")
      .then(rows => {
        assert.deepEqual(rows, [{ "1": 1 }]);
        done();
      })
      .catch(done);
  });

  it("query to much parameter", function(done) {
    shareConn.query("CREATE TEMPORARY TABLE to_much_parameters (id int, id2 int, id3 int)");
    shareConn
      .query("INSERT INTO to_much_parameters values (?, ?, ?) ", [1, 2, 3, 4])
      .then(() => done())
      .catch(done);
  });

  // it("fetching error", function(done) {
  //   let hasThrownError = false;
  //   shareConn
  //     .query("SELECT * FROM unknownTable")
  //     .on("error", function(err) {
  //       assert.ok(
  //         err.message.includes("Table") &&
  //           err.message.includes("doesn't exist") &&
  //           err.message.includes("sql: SELECT * FROM unknownTable")
  //       );
  //       hasThrownError = true;
  //     })
  //     .on("fields", function(fields) {
  //       done(new Error("must have not return fields"));
  //     })
  //     .on("result", function(row) {
  //       done(new Error("must have not return results"));
  //     })
  //     .on("end", function() {
  //       assert.ok(hasThrownError);
  //       done();
  // });
});
