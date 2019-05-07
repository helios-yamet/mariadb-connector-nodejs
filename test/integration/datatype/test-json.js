'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

describe('json', () => {
  it('insert json format', function(done) {
    //server permit JSON format
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 7)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    shareConn.query(
      'CREATE TEMPORARY TABLE `test-json-insert-type` (val1 JSON)'
    );
    const obj = { id: 2, val: 'test' };
    shareConn.query(
      {
        stringifyObjects: true,
        sql: 'INSERT INTO `test-json-insert-type` values (?)'
      },
      [obj]
    );
    shareConn.query('INSERT INTO `test-json-insert-type` values (?)', [
      JSON.stringify(obj)
    ]);
    validateJSON('test-json-insert-type', done);
  });

  function validateJSON(tableName, done) {
    shareConn
      .query('SELECT * FROM `' + tableName + '`')
      .then(rows => {
        if (shareConn.info.isMariaDB()) {
          const val1 = JSON.parse(rows[0].val1);
          const val2 = JSON.parse(rows[1].val1);
          assert.equal(val1.id, 2);
          assert.equal(val1.val, 'test');
          assert.equal(val2.id, 2);
          assert.equal(val2.val, 'test');
        } else {
          assert.equal(rows[0]['val1'].id, 2);
          assert.equal(rows[0].val1.val, 'test');
          assert.equal(rows[1].val1.id, 2);
          assert.equal(rows[1].val1.val, 'test');
        }
        done();
      })
      .catch(done);
  }

  it('select json format', function(done) {
    //server permit JSON format
    if (
      (shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(10, 2, 7)) ||
      (!shareConn.info.isMariaDB() && !shareConn.info.hasMinVersion(5, 7, 8))
    ) {
      this.skip();
    }

    shareConn.query(
      'CREATE TEMPORARY TABLE `test-json-return-type` (val1 JSON, val2 LONGTEXT, val3 LONGBLOB)'
    );
    const obj = { id: 2, val: 'test' };
    const jsonString = JSON.stringify(obj);
    shareConn.query(
      "INSERT INTO `test-json-return-type` values ('" +
        jsonString +
        "','" +
        jsonString +
        "','" +
        jsonString +
        "')"
    );

    shareConn
      .query('SELECT * FROM `test-json-return-type`')
      .then(rows => {
        if (shareConn.info.isMariaDB()) {
          assert.equal(rows[0].val1, jsonString);
        } else {
          assert.equal(rows[0].val1.id, 2);
          assert.equal(rows[0].val1.val, 'test');
        }
        assert.equal(rows[0].val2, jsonString);
        assert.equal(rows[0].val3, jsonString);
        done();
      })
      .catch(done);
  });
});
