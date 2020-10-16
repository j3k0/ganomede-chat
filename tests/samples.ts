const defaultExport = {};
defaultExport.users = {
  alice: {token: 'alice-token', username: 'alice'},
  bob: {token: 'bob-token', username: 'bob'},
  harry: {token: 'harry-token', username: 'harry'},
  'banned-joe': {token: 'banned-joe-token', username: 'banned-joe'}
};

defaultExport.rooms = [{
  id: 'game/v1/alice/bob',
  type: 'game/v1',
  users: ['alice', 'bob']
}
, {
  id: 'game/v1/user1/user2',
  type: 'game/v1',
  users: ['user1', 'user2']
}
];

defaultExport.messages = [
  // rooms[0]
  [{
    "timestamp": 1429084010000,
    "from": "alice",
    "type": "text",
    "message": "Hey bob! How are you today?"
  }
  , {
    "timestamp": 1429084020000,
    "from": "bob",
    "type": "text",
    "message": "Hi Alice :)"
  }
  , {
    "timestamp": 1429084030000,
    "from": "bob",
    "type": "text",
    "message": "Good thanks, let's play"
  }
  , {
    "timestamp": 1429084040000,
    "from": "$$",
    "type": "event",
    "message": "game_started"
  }
  ],
  // rooms[1]
  [{
    "timestamp": 1429084010000,
    "from": "user1",
    "type": "text",
    "message": "welcome"
  }
  , {
    "timestamp": 1429084020000,
    "from": "user2",
    "type": "text",
    "message": "hello"
  }
  ]
];

if (!module.parent) {
  console.log(defaultExport);
}
export default defaultExport;
