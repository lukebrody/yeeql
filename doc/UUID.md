# `UUID`

A string-based type that yeeql uses as a unique identifier for inserted objects.

```typescript
import { UUID } from 'yeeql'
```

## `UUID.new(): UUID`

Creates a new, randomly generated UUID.
For space efficiency, UUIDs are encoded as `latin1` (i.e. Base256) strings.

## `UUID.length`

The length in bytes of all `UUID`s. This value is 8.

## `UUID.encode(uuid: UUID): Uint8Array`

Converts a `UUID` into a byte array for saving or transmission through the network.

## `UUID.decode(data: Uint8Array): UUID`

Converts a byte array into a `UUID`. Throws an error if the array is not exactly `UUID.length` bytes long.
