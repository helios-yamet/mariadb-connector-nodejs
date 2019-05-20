'use strict';

const base = require('../base.js');
const { assert } = require('chai');
const moment = require('moment-timezone');

describe('connection option', () => {
  it('with undefined collation', function(done) {
    base
      .createConnection({ charset: 'unknown' })
      .then(() => {
        done(new Error('must have thrown error!'));
      })
      .catch(err => {
        assert(err.message.includes('Unknown charset'));
        done();
      });
  });

  it('wrong IANA timezone', function(done) {
    base
      .createConnection({ timezone: 'unknown' })
      .then(() => {
        done(new Error('must have thrown error'));
      })
      .catch(err => {
        assert.isTrue(err.message.includes("Unknown IANA timezone 'unknown'"));
        assert.equal(err.errno, 45033);
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
        done();
      });
  });

  it('automatic timezone', function(done) {
    let mustFail = true;
    shareConn
      .query('SELECT @@system_time_zone stz, @@time_zone tz')
      .then(res => {
        const serverTimezone = res[0].tz === 'SYSTEM' ? res[0].stz : res[0].tz;
        const serverZone = moment.tz.zone(serverTimezone);
        if (serverZone) {
          mustFail = false;
        }

        base
          .createConnection({ timezone: 'auto' })
          .then(conn => {
            conn.end();
            if (mustFail) {
              done(new Error('must have thrown error'));
            } else {
              done();
            }
          })
          .catch(err => {
            if (mustFail) {
              assert.isTrue(
                err.message.includes('Automatic timezone setting fails')
              );
              assert.equal(err.errno, 45036);
              assert.equal(err.sqlState, '08S01');
              assert.equal(err.code, 'ER_WRONG_AUTO_TIMEZONE');
              done();
            } else {
              done(new Error('must have thrown error'));
            }
          });
      })
      .catch(done);
  });

  it('timezone Z', function(done) {
    base
      .createConnection({ timezone: 'Z' })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query('SELECT UNIX_TIMESTAMP(?) tt', [
            new Date('2000-01-01T00:00:00Z')
          ])
          .then(res => {
            // = 1999-12-31T23:00:00.000Z
            assert.deepEqual(res[0].tt, 946681200);
            return conn.query(
              "SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2",
              [new Date('2000-01-01T00:00:00Z')]
            );
          })
          .then(res => {
            assert.deepEqual(res[0].tt1, new Date('2003-12-31T13:00:00+01:00'));
            assert.deepEqual(res[0].tt2, new Date('2000-01-01T01:00:00+01:00'));
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('timezone +2h', function(done) {
    base
      .createConnection({ timezone: '+02' })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query('SELECT UNIX_TIMESTAMP(?) tt', [
            new Date('2000-01-01T00:00:00Z')
          ])
          .then(res => {
            assert.deepEqual(res[0].tt, 946688400);
            return conn.query(
              "SELECT TIMESTAMP('2003-12-31 12:00:00') tt1, FROM_UNIXTIME(UNIX_TIMESTAMP(?)) tt2",
              [new Date('2000-01-01T00:00:00Z')]
            );
          })
          .then(res => {
            assert.deepEqual(res[0].tt1, new Date('2003-12-31T11:00:00+01:00'));
            assert.deepEqual(res[0].tt2, new Date('2000-01-01T01:00:00+01:00'));
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('timezone +2h00', function(done) {
    base
      .createConnection({ timezone: '+02:00' })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query('SELECT UNIX_TIMESTAMP(?) tt', [
            new Date('2000-01-01T00:00:00Z')
          ])
          .then(res => {
            //946688400 => 2000-01-01T01:00:00.000Z
            assert.deepEqual(res[0].tt, 946688400);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('timezone +1h', function(done) {
    base
      .createConnection({ timezone: '+01:00' })
      .then(conn => {
        conn.query("SET SESSION time_zone = '+01:00'");
        conn
          .query('SELECT UNIX_TIMESTAMP(?) tt', [
            new Date('2000-01-01T00:00:00+0100')
          ])
          .then(res => {
            assert.deepEqual(res[0].tt, 946681200);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('timezone -1h', function(done) {
    base
      .createConnection({ timezone: '-01:00' })
      .then(conn => {
        conn.query("SET SESSION time_zone = '-01:00'");
        conn
          .query('SELECT UNIX_TIMESTAMP(?) tt', [
            new Date('2000-01-01T00:00:00+0100')
          ])
          .then(res => {
            assert.deepEqual(res[0].tt, 946681200);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('wrong timezone format', function(done) {
    base
      .createConnection({ timezone: '+e:00' })
      .then(conn => {
        done(new Error('Must have thrown exception'));
      })
      .catch(err => {
        assert.isTrue(err.message.includes("Unknown IANA timezone '+e:00'"));
        assert.equal(err.errno, 45033);
        assert.equal(err.sqlState, '08S01');
        assert.equal(err.code, 'ER_WRONG_IANA_TIMEZONE');
        done();
      });
  });

  it('IANA local tz', function(done) {
    const localTz = moment.tz.guess();
    base
      .createConnection({ timezone: localTz })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('IANA tz links', function(done) {
    moment.tz.link(moment.tz.guess() + '|myLink');
    base
      .createConnection({ timezone: 'myLink' })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it('Server with different tz', function(done) {
    //MySQL 5.5 doesn't have milliseconds
    if (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 6, 0))
      this.skip();

    base
      .createConnection({ timezone: 'Etc/GMT+5' })
      .then(conn => {
        const now = new Date();
        conn.query("SET SESSION time_zone = '-05:00'");
        conn.query('CREATE TEMPORARY TABLE t1 (a timestamp(6))');
        conn.query('INSERT INTO t1 values (?)', now);
        conn.query('SELECT NOW() as b, t1.a FROM t1').then(res => {
          assert.deepEqual(res[0].a, now);
          assert.isOk(Math.abs(res[0].b.getTime() - now.getTime()) < 5000);
          conn.end();
          done();
        });
      })
      .catch(done);
  });

  it('nestTables results boolean', function(done) {
    base
      .createConnection({ nestTables: true })
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query('SELECT * FROM t1, t2')
          .then(rows => {
            assert.deepEqual(rows, [
              { t1: { a: 'bla' }, t2: { b: 'bou' } },
              { t1: { a: 'bla2' }, t2: { b: 'bou' } }
            ]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('nestTables results string', function(done) {
    base
      .createConnection({ nestTables: '_' })
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query('SELECT * FROM t1, t2')
          .then(rows => {
            assert.deepEqual(rows, [
              { t1_a: 'bla', t2_b: 'bou' },
              { t1_a: 'bla2', t2_b: 'bou' }
            ]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('rows as array', function(done) {
    base
      .createConnection({ rowsAsArray: true })
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query('SELECT * FROM t1, t2')
          .then(rows => {
            assert.deepEqual(rows, [['bla', 'bou'], ['bla2', 'bou']]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('query option rows as array', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ rowsAsArray: true, sql: 'SELECT * FROM t1, t2' })
          .then(rows => {
            assert.deepEqual(rows, [['bla', 'bou'], ['bla2', 'bou']]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('nestTables results query boolean', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ nestTables: true, sql: 'SELECT * FROM t1, t2' })
          .then(rows => {
            assert.deepEqual(rows, [
              { t1: { a: 'bla' }, t2: { b: 'bou' } },
              { t1: { a: 'bla2' }, t2: { b: 'bou' } }
            ]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });

  it('nestTables results query string', function(done) {
    base
      .createConnection()
      .then(conn => {
        conn.query('CREATE TEMPORARY TABLE t1 (a varchar(20))');
        conn.query('CREATE TEMPORARY TABLE t2 (b varchar(20))');
        conn.query("INSERT INTO t1 VALUES ('bla'), ('bla2')");
        conn.query("INSERT INTO t2 VALUES ('bou')");
        conn
          .query({ nestTables: '_', sql: 'SELECT * FROM t1, t2' })
          .then(rows => {
            assert.deepEqual(rows, [
              { t1_a: 'bla', t2_b: 'bou' },
              { t1_a: 'bla2', t2_b: 'bou' }
            ]);
            return conn.end();
          })
          .then(() => {
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});
