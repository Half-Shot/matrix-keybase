# matrix-keybase
A matrix <-> keybase bridge

## What can it do?

- Log in
- Simple DMs between two people sending text

## Setup


```bash
git clone git@github.com:Half-Shot/matrix-keybase.git
cd matrix-keybase
git checkout matrix-keybase
yarn
yarn build
```

- Fill in `config.yml` using the provided `config.sample.yml`  
- Fill in `registration.yml` using the provided `registration.sample.yml`  
- Link `registration.yml` in your homeservers configuration

```bash
node ./lib/app.js
```

## Usage

- Invite `@keybase:domain` to a 1:1 room and send a message containing `!login username paper key with spaces`.
- Wait for it to tell you that you are connected.
- Tell someone to message you.
- Accept thy invite.
- Two way messaging success!

## Future Plans

- Full profile support
- Following/accepting and revoking users
- Support for wallet functionality
- Richer messsage formatting
- File support
- Initiating DMs from matrix
- Group support.