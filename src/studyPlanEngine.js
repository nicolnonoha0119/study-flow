function createStudyBlocks(intervals) {
  const blocks = [];

  for (const interval of intervals) {
    let cursor = interval.start;
    const end = interval.end;

    while (cursor < end) {
      const remaining = end - cursor;

      // 基本は90分集中 + 10分休憩
      // ただし残りが短い場合は、残り時間をそのまま使う
      if (remaining <= 30) {
        blocks.push({
          type: "study",
          start: cursor,
          end,
        });

        cursor = end;
        continue;
      }

      const studyLength = Math.min(90, remaining);

      blocks.push({
        type: "study",
        start: cursor,
        end: cursor + studyLength,
      });

      cursor += studyLength;

      if (cursor < end) {
        const restLength = Math.min(10, end - cursor);

        if (restLength >= 5) {
          blocks.push({
            type: "break",
            start: cursor,
            end: cursor + restLength,
          });

          cursor += restLength;
        }
      }
    }
  }

  return blocks;
}
