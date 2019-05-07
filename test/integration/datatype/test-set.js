'use strict';

const base = require('../../base.js');
const { assert } = require('chai');

describe('set', () => {
  it('set array', done => {
    shareConn.query(
      "CREATE TEMPORARY TABLE set_array(tt SET('v1','v2', 'v3'))"
    );

    shareConn.query(
      'INSERT INTO set_array values ' +
        "('v1'), " +
        "('v2'), " +
        "('v1,v2'), " +
        "('v3'), " +
        "('v3,v2'), " +
        "('')," +
        '(null)'
    );

    shareConn
      .query('SELECT * from set_array')
      .then(rows => {
        assert.deepEqual(rows, [
          { tt: ['v1'] },
          { tt: ['v2'] },
          { tt: ['v1', 'v2'] },
          { tt: ['v3'] },
          { tt: ['v2', 'v3'] },
          { tt: [] },
          { tt: null }
        ]);
        done();
      })
      .catch(done);
  });
});
