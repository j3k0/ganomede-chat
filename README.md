Chat
----

Multi-rooms chat service.

Chat is organized into "rooms". Each room has a type and a list of players allowed to participate.

Relations
---------

 * "AuthDB" (Redis) -> to check authentication status of user making requests
   * see https://github.com/j3k0/node-authdb
 * Notification service -> notify users when a chat message was added to a room
   * see https://github.com/j3k0/ganomede-notifications

Configuration
-------------

Variables available for service configuration (see [config.js](/config.js)):

 * `PORT`
 * `ROUTE_PREFIX`
 * `REDIS_AUTH_PORT_6379_TCP_ADDR` - IP of the AuthDB redis
 * `REDIS_AUTH_PORT_6379_TCP_PORT` - Port of the AuthDB redis
 * `NOTIFICATIONS_PORT_8080_TCP_ADDR` - IP of the notifications service
 * `NOTIFICATIONS_PORT_8080_TCP_PORT` - Port of the notifications service
 * `MAX_MESSAGES` - Max number of messages stored in a room (default 100)
 * `API_SECRET` - Give access to private APIs
 * `NODE_ENV` — Antything except `production` means that app is running in development (debug) mode

AuthDB
------

 * Contains a store "authToken" -> { "username": "someusername", ... }
 * Access it using node-authdb (https://github.com/j3k0/node-authdb)

API
---

All "room" related calls require a valid authToken, either:

 * the token for one of the room participants.
 * `API_SECRET`, in which case messages are posted as pseudo-user "$$"

# Rooms [/chat/v1/auth/:authToken/rooms]

## Create a room [POST]

Create a room with a given configuration (or return the one that already exists).

### body (application/json)

    {
        "type": "triominos/v1",
        "users": [ "alice", "bob" ]
    }

### response [200] OK

    {
        "id": "triominos/v1/alice/bob",
        "type": "triominos/v1",
        "users": [ "alice", "bob" ],
        "messages": [{
            "timestamp": 1429084002258,
            "from": "alice",
            "type": "text",
            "message": "Hey bob! How are you today?"
        }]
    }

### design note

Forming the id by concatening `type` and usernames (sorted) is an internal-detail suggestion that should make it easier to find if a room with the given config already exists, it's not mandatory. Client shouldn't rely on that to be true.

# Room [/chat/v1/auth/:authToken/rooms/:roomId]

    + Parameters
        + authToken (string, required) ... Authentication token
        + roomId (string, required) ... Room identifier

## Retrieve content of a room [GET]

### response [200] OK

    {
        "id": "triominos/v1/alice/bob",
        "type": "triominos/v1",
        "users": [ "alice", "bob" ],
        "messages": [{
            "timestamp": 1429084002258,
            "from": "alice",
            "type": "text",
            "message": "Hey bob! How are you today?"
        }, {
            "timestamp": 1429084002258,
            "from": "bob",
            "type": "text",
            "message": "Hi Alice :)"
        }, {
            "timestamp": 1429084002258,
            "from": "bob",
            "type": "text",
            "message": "Good thanks, let's play"
        }, {
            "timestamp": 1429084002258,
            "from": "$$",
            "type": "event",
            "message": "game_started"
        }]
    }

### response [400] No such room

### response [401] Unauthorized

If authToken is invalid or user isn't a participant in the room, and not `API_SECRET`.

# Messages [/chat/v1/auth/:authToken/rooms/:roomId/messages]

    + Parameters
        + authToken (string, required) ... Authentication token
        + roomId (string, required) ... Room identifier

## Add a message [POST]

Append a new message to the room. If the number of messages in the room exceeds `MAX_MESSAGES`, the oldest will be discarded.

### body (application/json)

    {
        "timestamp": 1429084016939,
        "type": "txt",
        "message": "Hey bob! How are you today?"
    }

### response [200] OK

### response [401] Unauthorized

If authToken is invalid or user isn't a participant in the room, and not `API_SECRET`.

### design note

A notification will be sent to all users in the room (except the sender of the message).

    {
        "from": "chat/v1",
        "type": "message",
        "data": {
            "timestamp": 1429084002258,
            "from": "bob",
            "type": "text",
            "message": "Good thanks, let's play"
        }
    }

**push notification**

An optional `push` field can be added in the body of the added message. If set, the content of this field will be added to the notification, but won't be stored in the room's message.

