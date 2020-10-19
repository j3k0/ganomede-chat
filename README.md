Chat
----

Multi-rooms chat service.

Chat is organized into "rooms". Each room has a type and a list of players allowed to participate.

Relations
---------

 * "AuthDB" (Redis) -> to check authentication status of user making requests
   * see https://github.com/j3k0/node-authdb
 * "ChatDB" (Redis) -> store rooms messages
 * Notification service -> notify users when a chat message was added to a room
   * see https://github.com/j3k0/ganomede-notifications

Configuration
-------------

Variables available for service configuration (see [config.js](/config.js)):

 * `PORT`
 * `ROUTE_PREFIX`
 * `API_SECRET` - Give access to private APIs
 * `NODE_ENV` — Antything except `production` means that app is running in development (debug) mode
 * `MAX_MESSAGES` - Max number of messages stored in a room (default 100)

Links with DBs and other services:

 * `REDIS_AUTH_PORT_6379_TCP_ADDR` - IP of the AuthDB redis
 * `REDIS_AUTH_PORT_6379_TCP_PORT` - Port of the AuthDB redis
 * `REDIS_CHAT_PORT_6379_TCP_ADDR` - IP of the ChatDB redis
 * `REDIS_CHAT_PORT_6379_TCP_PORT` - Port of the ChatDB redis
 * `NOTIFICATIONS_PORT_8080_TCP_ADDR` - IP of the notifications service
 * `NOTIFICATIONS_PORT_8080_TCP_PORT` - Port of the notifications service

Optional link to the usermeta database containing user policies (see policies.md)

 * `REDIS_USERMETA_PORT_6379_TCP_ADDR` - IP of the UsermetaDB redis
 * `REDIS_USERMETA_PORT_6379_TCP_PORT` - Port of the UsermetaDB redis
 * If any of these options are missing, no ban or block check will be performed — every user account will be considered to be in good standing (no bans)

Statsd options (used for monitoring).

 * `STATSD_HOST` - host that runs the statsd server
 * `STATSD_PORT` - port to connect to statsd server
 * `STATSD_PREFIX` - prefix for data stored in stats (default to `ganomede.chat.`)

AuthDB
------

 * Contains a store "authToken" -> { "username": "someusername", ... }
 * Access it using node-authdb (https://github.com/j3k0/node-authdb)

UsermetaDB
----------

Contains the policies (banned, blocked users, chat disabled, etc)
 
 * `userA:$blocked` -> `user1,user2,user3`
   * List of users that "userA" has blocked. Messages from users in this list won't be sent to "userA".
 * `userA:$banned` -> timestamp
   * trueish if the user is banned.
 * `userA:$chat_disabled`-> `"true"`
   * the string `"true"` indicates that the chat is disabled for this user.


API
---

All "room" related calls require a valid authToken, either:

 * the token for one of the room participants.
 * `API_SECRET`, in which case messages are posted as pseudo-user "$$"

# Rooms [/chat/v1/auth/:authToken/rooms]

## Create a room [POST]

Create a room with a given configuration (or return the one that already exists and update its ttl).

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
        "messages": []
    }

### response [403] Forbidden

When linked to users service, will perform ban check. Banned `:username`s will receive 403 error no matter validity of a token.

### design note

Room is gonna expire 60 days after last POST.

Room's id is formed using following code:

``` coffee
"#{body.type}/#{body.users.sort().join('/')}"
```

# Room [/chat/v1/auth/:authToken/rooms/:roomId]

    + Parameters
        + authToken (string, required) ... Authentication token
        + roomId (string, required) ... URL encoded Room ID

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

### response [404] Not found

No room found with given ID.

### response [401] Unauthorized

If authToken is invalid or user isn't a participant in the room, and not `API_SECRET`.

# Messages [/chat/v1/auth/:authToken/rooms/:roomId/messages]

    + Parameters
        + authToken (string, required) ... Authentication token
        + roomId (string, required) ... URL encoded Room ID

## Add a message [POST]

Append a new message to the room and updates room's TTL. If the number of messages in the room exceeds `MAX_MESSAGES`, the oldest will be discarded.

### body (application/json)

    {
        "timestamp": 1429084016939,
        "type": "txt",
        "message": "Hey bob! How are you today?"
    }

### response [200] OK

### response [401] Unauthorized

If authToken is invalid or user isn't a participant in the room, and not `API_SECRET`.

### response [403] Forbidden

When linked to users service, will perform ban check. Banned `:username`s will receive 403 error no matter validity of a token.

### response [404] Not Found

No room found with given ID.

### design note

A notification will be sent to all users in the room (except the sender of the message and those that blocked him).

    {
        "from": "chat/v1",
        "type": "message",
        "data": {
            "timestamp": 1429084002258,
            "from": "bob",
            "type": "text",
            "message": "Good thanks, let's play"
        }
        "push": {…} // optional, will contain whatever is in `req.body.push`.
    }

# System Messages [/chat/v1/auth/:apiSecret/system-messages]

## Add a message [POST]

Join a room, append a new message and updates its TTL.
If the number of messages in the room exceeds `MAX_MESSAGES`, the oldest will be discarded.

### body (application/json)

    {
        "type": "triominos/v1",
        "users": [ "alice", "bob" ]
        "timestamp": 1429084016939,
        "message": "ALICE_DISCONNECTED"
    }

### response [200] OK

### design note

Response codes and design notes as for the /messages entrypoint.
