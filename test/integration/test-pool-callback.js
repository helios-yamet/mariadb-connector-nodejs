"use strict";

const base = require("../base.js");
const { assert } = require("chai");

describe("Pool callback", () => {
  it("create pool", function(done) {
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    const initTime = Date.now();
    pool.getConnection((err, conn) => {
      conn.query("SELECT SLEEP(1)", () => {
        conn.release();
      });
    });
    pool.getConnection((err, conn) => {
      conn.query("SELECT SLEEP(1)", () => {
        assert(Date.now() - initTime >= 1999, "expected > 2s, but was " + (Date.now() - initTime));
        conn.release();
        pool.end();
        done();
      });
    });
  });

  it("pool wrong query", function(done) {
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.query("wrong query", err => {
      assert(err.message.includes("You have an error in your SQL syntax"));
      assert.equal(err.sqlState, "42000");
      assert.equal(err.code, "ER_PARSE_ERROR");
      pool.end();
      done();
    });
  });

  it("pool getConnection after close", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.end(() => {
      pool.getConnection(err => {
        assert(err.message.includes("pool is closed"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45027);
        assert.equal(err.code, "ER_POOL_ALREADY_CLOSED");
        done();
      });
    });
  });

  it("pool query after close", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.end(() => {
      pool.query("select ?", 1, err => {
        assert(err.message.includes("pool is closed"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45027);
        assert.equal(err.code, "ER_POOL_ALREADY_CLOSED");
        done();
      });
    });
  });

  it("pool getConnection timeout", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 1, acquireTimeout: 200 });
    let errorThrown = false;
    pool.query("SELECT SLEEP(1)", err => {
      if (err) {
        done(err);
      } else {
        pool.end();
        assert.isOk(errorThrown);
        done();
      }
    });
    pool.getConnection(err => {
      assert(err.message.includes("retrieve connection from pool timeout"));
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.errno, 45028);
      assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
      errorThrown = true;
    });
  });

  it("pool query timeout", function(done) {
    this.timeout(5000);
    const pool = base.createPoolCallback({ connectionLimit: 1, acquireTimeout: 500 });
    const initTime = Date.now();
    pool.query("SELECT SLEEP(?)", 2, () => {
      pool.end();
    });
    pool.query("SELECT 1", (err, res) => {
      assert(err.message.includes("retrieve connection from pool timeout"));
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.errno, 45028);
      assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
    });
    pool.query("SELECT 2", err => {
      assert(err.message.includes("retrieve connection from pool timeout"));
      assert.equal(err.sqlState, "HY000");
      assert.equal(err.errno, 45028);
      assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
      const elapse = Date.now() - initTime;
      assert.isOk(
        elapse >= 500 && elapse < 550,
        "elapse time was " + elapse + " but must be just after 500"
      );
    });
    setTimeout(() => {
      pool.query("SELECT 3", err => {
        assert(err.message.includes("retrieve connection from pool timeout"));
        assert.equal(err.sqlState, "HY000");
        assert.equal(err.errno, 45028);
        assert.equal(err.code, "ER_GET_CONNECTION_TIMEOUT");
        const elapse = Date.now() - initTime;
        assert.isOk(
          elapse >= 700 && elapse < 750,
          "elapse time was " + elapse + " but must be just after 700"
        );
        done();
      });
    }, 200);
  });

  it("pool grow", function(done) {
    this.timeout(20000);
    const pool = base.createPoolCallback({ connectionLimit: 10 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 10);
      assert.equal(pool.idleConnections(), 10);
      assert.equal(pool.taskQueueSize(), 0);

      for (let i = 0; i < 10000; i++) {
        pool.query("SELECT ? as a", [i], (err, rows) => {
          if (err) {
            done(err);
          } else {
            assert.deepEqual(rows, [{ a: i }]);
          }
        });
      }
      setImmediate(() => {
        assert.equal(pool.activeConnections(), 10);
        assert.equal(pool.totalConnections(), 10);
        assert.equal(pool.idleConnections(), 0);
        assert.equal(pool.taskQueueSize(), 9990);

        setTimeout(() => {
          pool.end();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 0);
          assert.equal(pool.idleConnections(), 0);
          assert.equal(pool.taskQueueSize(), 0);
          done();
        }, 5000);
      });
    }, 8000);
  });

  it("connection fail handling", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);

          conn.query("KILL CONNECTION_ID()", err => {
            assert.equal(err.sqlState, 70100);
            assert.equal(pool.activeConnections(), 1);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 1);
            assert.equal(pool.taskQueueSize(), 0);
            conn.end(() => {
              assert.equal(pool.activeConnections(), 0);
              assert.equal(pool.totalConnections(), 1);
              assert.equal(pool.idleConnections(), 1);
              assert.equal(pool.taskQueueSize(), 0);
              pool.end();
              done();
            });
          });
        }
      });
    }, 500);
  });

  it("query fail handling", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);
      assert.equal(pool.taskQueueSize(), 0);

      pool.query("KILL CONNECTION_ID()", err => {
        assert.equal(err.sqlState, 70100);
        setImmediate(() => {
          //waiting for rollback to end
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);
          assert.equal(pool.taskQueueSize(), 0);

          setTimeout(() => {
            pool.query("do 1");
            pool.query("do 1", () => {
              setTimeout(() => {
                //connection recreated
                assert.equal(pool.activeConnections(), 0);
                assert.equal(pool.totalConnections(), 2);
                assert.equal(pool.idleConnections(), 2);
                assert.equal(pool.taskQueueSize(), 0);
                pool.end();
                done();
              }, 250);
            });
          }, 250);
        });
      });
    }, 500);
  });

  it("connection end", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.end(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end();
            done();
          });
        }
      });
    }, 500);
  });

  it("connection release alias", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.release(() => {
            assert.equal(pool.activeConnections(), 0);
            assert.equal(pool.totalConnections(), 2);
            assert.equal(pool.idleConnections(), 2);
            pool.end();
            done();
          });
        }
      });
    }, 500);
  });

  it("connection destroy", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 2 });
    setTimeout(() => {
      //check available connections in pool
      assert.equal(pool.activeConnections(), 0);
      assert.equal(pool.totalConnections(), 2);
      assert.equal(pool.idleConnections(), 2);

      pool.getConnection((err, conn) => {
        if (err) {
          done(err);
        } else {
          //check available connections in pool
          assert.equal(pool.activeConnections(), 1);
          assert.equal(pool.totalConnections(), 2);
          assert.equal(pool.idleConnections(), 1);

          conn.destroy();

          assert.equal(pool.activeConnections(), 0);
          assert.equal(pool.totalConnections(), 1);
          assert.equal(pool.idleConnections(), 1);
          pool.end();
          done();
        }
      });
    }, 500);
  });

  it("pool rollback on connection return", function(done) {
    const pool = base.createPoolCallback({ connectionLimit: 1 });
    pool.getConnection((err, conn) => {
      if (err) {
        done(err);
      } else {
        conn.query("DROP TABLE IF EXISTS rollbackTable", (err, res) => {
          conn.query("CREATE TABLE rollbackTable(col varchar(10))", (err, res) => {
            conn.query("set autocommit = 0", (err, res) => {
              conn.beginTransaction((err, res) => {
                conn.query("INSERT INTO rollbackTable value ('test')", (err, res) => {
                  conn.release(err => {
                    pool.getConnection((err, conn) => {
                      conn.query("SELECT * FROM rollbackTable", (err, res) => {
                        assert.equal(res.length, 0);
                        conn.end();
                        pool.end();
                        done();
                      });
                    });
                  });
                });
              });
            });
          });
        });
      }
    });
  });
});
