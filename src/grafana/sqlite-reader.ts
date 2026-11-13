// Reads the tables of a SQLite database file, read-only and whole, as Grafana keeps its database
// by default. Just enough of SQLite's file format for that: the table b-trees, their records and
// the pages they overflow into, with the write-ahead log laid over the file where there is one.
// https://www.sqlite.org/fileformat.html

export type SqliteValue = null | number | string | Uint8Array;

export interface SqliteDatabase {
  readonly tableNames: () => string[];
  /** The rows of a table, by the names of its columns; none when there is no such table. */
  readonly rows: (table: string) => Record<string, SqliteValue>[];
}

const header = "SQLite format 3\u0000";

const u16 = (bytes: Uint8Array, offset: number) => (bytes[offset] << 8) | bytes[offset + 1];
const u32 = (bytes: Uint8Array, offset: number) =>
  ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];

const varint = (bytes: Uint8Array, offset: number): [value: number, length: number] => {
  let value = 0;

  for (let index = 0; index < 8; index++) {
    const byte = bytes[offset + index];

    value = value * 128 + (byte & 0x7f);

    if ((byte & 0x80) === 0) {
      return [value, index + 1];
    }
  }

  return [value * 256 + bytes[offset + 8], 9];
};

// A big-endian two's complement integer of 1 to 8 bytes. Past 2^53 it loses precision, which
// none of what is read here comes near.
const signed = (bytes: Uint8Array, offset: number, length: number) => {
  let unsigned = 0;

  for (let index = 0; index < length; index++) {
    unsigned = unsigned * 256 + bytes[offset + index];
  }

  return bytes[offset] & 0x80 ? unsigned - 2 ** (8 * length) : unsigned;
};

// The pages that a write-ahead log holds newer copies of, as of its last committed transaction.
const pagesOfWal = (wal: Uint8Array, pageSize: number) => {
  const pages = new Map<number, Uint8Array>();
  const magic = wal.length >= 32 ? u32(wal, 0) : 0;

  if ((magic !== 0x377f0682 && magic !== 0x377f0683) || u32(wal, 8) !== pageSize) {
    return pages;
  }

  const salt1 = u32(wal, 16);
  const salt2 = u32(wal, 20);
  const pending = new Map<number, Uint8Array>();

  for (let offset = 32; offset + 24 + pageSize <= wal.length; offset += 24 + pageSize) {
    if (u32(wal, offset + 8) !== salt1 || u32(wal, offset + 12) !== salt2) {
      break;
    }

    pending.set(u32(wal, offset), wal.subarray(offset + 24, offset + 24 + pageSize));

    if (u32(wal, offset + 4) !== 0) {
      pending.forEach((page, number) => pages.set(number, page));
      pending.clear();
    }
  }

  return pages;
};

// The names of a table's columns, from the statement that made it, which SQLite keeps current.
const columnsOf = (sql: string) => {
  const body = sql.slice(sql.indexOf("(") + 1, sql.lastIndexOf(")"));
  const definitions: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let current = "";

  for (const char of body) {
    if (quote) {
      quote = char === quote ? undefined : quote;
    } else if (char === '"' || char === "'" || char === "`" || char === "[") {
      quote = char === "[" ? "]" : char;
    } else if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    } else if (char === "," && depth === 0) {
      definitions.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  definitions.push(current);

  return definitions
    .map((definition) => definition.trim())
    .filter((definition) => definition && !/^(constraint|primary|unique|check|foreign)\b/i.test(definition))
    .map((definition) => {
      const name = /^("([^"]+)"|`([^`]+)`|\[([^\]]+)\]|(\S+))/.exec(definition);

      return {
        name: name?.[2] ?? name?.[3] ?? name?.[4] ?? name?.[5] ?? "",
        // A column declared INTEGER PRIMARY KEY is the row's id, and kept as null in the record.
        isRowId: /^\S+\s+integer\s+primary\s+key\b/i.test(definition),
      };
    });
};

/** Opens a SQLite database from its file, and its write-ahead log where it has one. */
export const openSqlite = (file: Uint8Array, wal?: Uint8Array): SqliteDatabase => {
  if (file.length < 100 || new TextDecoder().decode(file.subarray(0, 16)) !== header) {
    throw new Error("Not a SQLite database");
  }

  const pageSize = u16(file, 16) === 1 ? 65536 : u16(file, 16);
  const usable = pageSize - file[20];
  const encoding = u32(file, 56);
  const decoder = new TextDecoder(encoding === 2 ? "utf-16le" : encoding === 3 ? "utf-16be" : "utf-8");
  const newer = wal ? pagesOfWal(wal, pageSize) : new Map<number, Uint8Array>();

  const page = (number: number) => {
    const fromWal = newer.get(number);

    if (fromWal) {
      return fromWal;
    }

    if (number < 1 || number * pageSize > file.length) {
      throw new Error(`The database has no page ${number}: it may have changed while it was copied`);
    }

    return file.subarray((number - 1) * pageSize, number * pageSize);
  };

  // A cell's payload: what fits on its page, and the rest from the chain of pages it overflows to.
  const payloadOf = (bytes: Uint8Array, offset: number, size: number) => {
    const most = usable - 35;
    const least = Math.floor(((usable - 12) * 32) / 255) - 23;
    const spilled = least + ((size - least) % (usable - 4));
    const local = size <= most ? size : spilled <= most ? spilled : least;

    if (local === size) {
      return bytes.subarray(offset, offset + size);
    }

    const payload = new Uint8Array(size);
    let written = local;
    let next = u32(bytes, offset + local);

    payload.set(bytes.subarray(offset, offset + local));

    while (written < size && next !== 0) {
      const overflow = page(next);
      const length = Math.min(usable - 4, size - written);

      payload.set(overflow.subarray(4, 4 + length), written);
      written += length;
      next = u32(overflow, 0);
    }

    return payload;
  };

  const sizes: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 6, 6: 8 };

  const recordOf = (payload: Uint8Array): SqliteValue[] => {
    const [headerSize, headerLength] = varint(payload, 0);
    const types: number[] = [];

    for (let offset = headerLength; offset < headerSize;) {
      const [type, length] = varint(payload, offset);

      types.push(type);
      offset += length;
    }

    let offset = headerSize;

    return types.map((type): SqliteValue => {
      if (type === 0) {
        return null;
      }

      if (type === 8 || type === 9) {
        return type - 8;
      }

      if (type === 7) {
        const value = new DataView(payload.buffer, payload.byteOffset + offset, 8).getFloat64(0);

        offset += 8;

        return value;
      }

      if (type <= 6) {
        const value = signed(payload, offset, sizes[type]);

        offset += sizes[type];

        return value;
      }

      const length = type >= 12 ? Math.floor((type - 12) / 2) : 0;
      const bytes = payload.subarray(offset, offset + length);

      offset += length;

      return type % 2 === 1 ? decoder.decode(bytes) : bytes;
    });
  };

  // The rows of a table's b-tree, by their row ids, walked without recursion.
  const rowsOfTree = (root: number): { rowId: number; values: SqliteValue[] }[] => {
    const rows: { rowId: number; values: SqliteValue[] }[] = [];
    const stack = [root];
    const seen = new Set<number>();

    while (stack.length) {
      const number = stack.pop()!;

      if (seen.has(number)) {
        throw new Error("The database's pages loop: it may have changed while it was copied");
      }

      seen.add(number);

      const bytes = page(number);
      const start = number === 1 ? 100 : 0;
      const type = bytes[start];
      const cells = u16(bytes, start + 3);

      if (type === 0x05) {
        const children: number[] = [];

        for (let cell = 0; cell < cells; cell++) {
          children.push(u32(bytes, u16(bytes, start + 12 + cell * 2)));
        }

        children.push(u32(bytes, start + 8));
        // Walked from the last, so the rows come in the order of their ids.
        stack.push(...children.reverse());
      } else if (type === 0x0d) {
        for (let cell = 0; cell < cells; cell++) {
          let offset = u16(bytes, start + 8 + cell * 2);
          const [size, sizeLength] = varint(bytes, offset);

          offset += sizeLength;

          const [rowId, rowIdLength] = varint(bytes, offset);

          offset += rowIdLength;
          rows.push({ rowId, values: recordOf(payloadOf(bytes, offset, size)) });
        }
      } else {
        throw new Error(`Page ${number} is not of a table: the database may have changed while it was copied`);
      }
    }

    return rows;
  };

  const schema = rowsOfTree(1).map(({ values: [type, name, , rootPage, sql] }) => ({
    type,
    name: String(name),
    rootPage: Number(rootPage),
    sql: typeof sql === "string" ? sql : "",
  }));

  const tables = schema.filter((one) => one.type === "table" && one.rootPage > 0 && !/without\s+rowid/i.test(one.sql));

  return {
    tableNames: () => tables.map((table) => table.name),

    rows: (name) => {
      const table = tables.find((one) => one.name === name);

      if (!table) {
        return [];
      }

      const columns = columnsOf(table.sql);

      return rowsOfTree(table.rootPage).map(({ rowId, values }) =>
        Object.fromEntries(
          columns.map((column, index) => [
            column.name,
            column.isRowId && (values[index] === null || values[index] === undefined) ? rowId : (values[index] ?? null),
          ]),
        ),
      );
    },
  };
};
