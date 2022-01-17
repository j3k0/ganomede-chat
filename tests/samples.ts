export default {
  users: {
    alice: { token: 'alice-token', username: 'alice', email: 'alice@test.com', ConfirmedOn: { 'alice@test.com': 123456789 } },
    bob: { token: 'bob-token', username: 'bob', email: 'bob@test.com', ConfirmedOn: { 'bob@test.com': 1255654 } },
    harry: { token: 'harry-token', username: 'harry', email: 'harry@test.com', ConfirmedOn: { 'harry@test.com': 1255654 } },
    tutoro: { token: 'tutoro-token', username: 'tutoro' },
    tutoro2: { token: 'tutoro2-token', username: 'tutoro2', email: 'test@test.com' },
    tutoro3: { token: 'tutoro3-token', username: 'tutoro3', email: 'tutoro3@test.com', ConfirmedOn: { 'something@test.com': 1255654 } },
  },

  rooms: [{
    id: 'game/v1/alice/bob',
    type: 'game/v1',
    users: ['alice', 'bob']
  }, {
    id: 'game/v1/user1/user2',
    type: 'game/v1',
    users: ['user1', 'user2']
  }],

  messages: [
    // rooms[0]
    [{
      "timestamp": 1429084010000,
      "from": "alice",
      "type": "text",
      "message": "Hey bob! How are you today?"
    }, {
      "timestamp": 1429084020000,
      "from": "bob",
      "type": "text",
      "message": "Hi Alice :)"
    }, {
      "timestamp": 1429084030000,
      "from": "bob",
      "type": "text",
      "message": "Good thanks, let's play"
    }, {
      "timestamp": 1429084040000,
      "from": "$$",
      "type": "event",
      "message": "game_started"
    }],
    // rooms[1]
    [{
      "timestamp": 1429084010000,
      "from": "user1",
      "type": "text",
      "message": "welcome"
    }, {
      "timestamp": 1429084020000,
      "from": "user2",
      "type": "text",
      "message": "hello"
    }]
  ]
};