export function findQualifiedCall(
  input: string,
  receiver: string,
  method: string,
  from: number,
) {
  for (let index = from; index < input.length; index += 1) {
    if (isStringDelimiter(input[index])) {
      const end = findStringLiteralEnd(input, index);
      if (end < 0) return undefined;
      index = end - 1;
      continue;
    }
    if (!input.startsWith(receiver, index)) continue;
    if (
      isIdentifierCharacter(input[index - 1]) ||
      isIdentifierCharacter(input[index + receiver.length])
    ) {
      continue;
    }

    let cursor = skipWhitespace(input, index + receiver.length);
    if (input[cursor] !== ".") continue;
    cursor = skipWhitespace(input, cursor + 1);
    if (!input.startsWith(method, cursor)) continue;
    if (
      isIdentifierCharacter(input[cursor - 1]) ||
      isIdentifierCharacter(input[cursor + method.length])
    ) {
      continue;
    }
    cursor = skipWhitespace(input, cursor + method.length);
    if (input[cursor] !== "(") continue;
    return { start: index, opening: cursor };
  }
  return undefined;
}

export function findTagInList(input: string, from: number) {
  for (let index = from; index < input.length; index += 1) {
    if (isStringDelimiter(input[index])) {
      const end = findStringLiteralEnd(input, index);
      if (end < 0) return undefined;
      index = end - 1;
      continue;
    }
    if (!input.startsWith("tag", index)) continue;
    if (
      isIdentifierCharacter(input[index - 1]) ||
      isIdentifierCharacter(input[index + 3])
    ) {
      continue;
    }

    let cursor = skipWhitespace(input, index + 3);
    if (!input.startsWith("in", cursor)) continue;
    if (
      isIdentifierCharacter(input[cursor - 1]) ||
      isIdentifierCharacter(input[cursor + 2])
    ) {
      continue;
    }
    cursor = skipWhitespace(input, cursor + 2);
    if (input[cursor] !== "[") continue;
    const end = findClosingDelimiter(input, cursor);
    if (end < 0) return undefined;
    return { start: index, listStart: cursor, end };
  }
  return undefined;
}

export function findClosingDelimiter(input: string, opening: number) {
  const expected = new Map([
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
  ]);
  const closing = new Set(expected.values());
  const stack: string[] = [];

  for (let index = opening; index < input.length; index += 1) {
    const character = input[index];
    if (character === undefined) continue;
    if (isStringDelimiter(character)) {
      const end = findStringLiteralEnd(input, index);
      if (end < 0) return -1;
      index = end - 1;
      continue;
    }
    if (expected.has(character)) {
      stack.push(expected.get(character) as string);
      continue;
    }
    if (!closing.has(character)) continue;
    if (stack.pop() !== character) return -1;
    if (stack.length === 0) return index;
  }
  return -1;
}

export function findStringLiteralEnd(input: string, start: number) {
  const delimiter = input[start];
  if (delimiter === undefined) return -1;
  const triple = input.startsWith(delimiter.repeat(3), start);
  const width = triple ? 3 : 1;

  for (let index = start + width; index < input.length; index += 1) {
    if (input[index] === "\\") {
      index += 1;
      continue;
    }
    if (
      triple
        ? input.startsWith(delimiter.repeat(3), index)
        : input[index] === delimiter
    ) {
      return index + width;
    }
  }
  return -1;
}

export function isStringDelimiter(value: string | undefined) {
  return value === '"' || value === "'" || value === "`";
}

export function isIdentifierCharacter(value: string | undefined) {
  return value !== undefined && /[A-Za-z0-9_]/.test(value);
}

export function skipWhitespace(input: string, from: number) {
  let index = from;
  while (/\s/.test(input[index] ?? "")) index += 1;
  return index;
}
