/*
========================================
 StudyFlow 自動学習計画エンジン

 ・曜日別設定なし
 ・全体の勉強可能時間を使用
 ・固定予定を除外
 ・優先度
 ・必要時間
 ・期限
 ・科目ごとの集中
 ・同じ科目の複数ブロック
 ・まとまった集中時間

 をもとに、今日の学習計画を自動作成します。

 Gemini / AI API 不使用
========================================
*/


/* ========================================
   時刻関連
======================================== */

function toMinutes(time) {
  if (!time) return null;

  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}


function toTime(minutes) {
  const safeMinutes = Math.max(
    0,
    Math.min(1439, Math.round(minutes))
  );

  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}


/* ========================================
   タスク情報
======================================== */

function getTaskTitle(task) {
  return (
    task?.title ||
    task?.taskTitle ||
    task?.name ||
    task?.task ||
    "学習"
  );
}


function getSubject(task) {
  return (
    task?.subject ||
    task?.category ||
    task?.subjectName ||
    "その他"
  );
}


/*
  タスク全体の必要時間
*/
function getMinutes(task) {
  const value =
    task?.minutes ??
    task?.duration ??
    task?.requiredMinutes ??
    task?.estimatedMinutes ??
    0;

  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.round(minutes));
}


/*
  すでに勉強した時間
*/
function getStudiedMinutes(task) {
  const value =
    task?.studied_minutes ??
    task?.studiedMinutes ??
    task?.completedMinutes ??
    task?.studyMinutes ??
    0;

  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.round(minutes));
}


/*
  まだ必要な時間
*/
function getRemainingMinutes(task) {
  const total = getMinutes(task);
  const studied = getStudiedMinutes(task);

  return Math.max(0, total - studied);
}


/* ========================================
   優先度
======================================== */

function getPriority(task) {
  const value =
    task?.priority ??
    task?.priorityLevel ??
    1;

  if (typeof value === "string") {
    const stars = value.match(/★/g);

    if (stars) {
      return Math.max(
        1,
        Math.min(5, stars.length)
      );
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return Math.max(
        1,
        Math.min(5, number)
      );
    }
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 1;
  }

  return Math.max(
    1,
    Math.min(5, number)
  );
}


/* ========================================
   完了判定
======================================== */

function isCompleted(task) {
  return (
    task?.completed === true ||
    task?.isCompleted === true ||
    task?.done === true ||
    task?.status === "completed" ||
    task?.status === "done"
  );
}


/* ========================================
   期限
======================================== */

function getDeadline(task) {
  return (
    task?.deadline ||
    task?.dueDate ||
    task?.due_date ||
    task?.deadlineDate ||
    null
  );
}


/*
  期限までの日数を取得

  期限が存在しない場合は null
*/
function getDaysUntilDeadline(task) {
  const deadline = getDeadline(task);

  if (!deadline) {
    return null;
  }

  const deadlineDate = new Date(deadline);

  if (Number.isNaN(deadlineDate.getTime())) {
    return null;
  }

  const now = new Date();

  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  const target = new Date(
    deadlineDate.getFullYear(),
    deadlineDate.getMonth(),
    deadlineDate.getDate()
  );

  const diff =
    target.getTime() -
    today.getTime();

  return Math.ceil(
    diff / (1000 * 60 * 60 * 24)
  );
}


/* ========================================
   固定予定
======================================== */

function getFixedStart(item) {
  return (
    item?.start ||
    item?.startTime ||
    item?.from ||
    item?.begin
  );
}


function getFixedEnd(item) {
  return (
    item?.end ||
    item?.endTime ||
    item?.to ||
    item?.finish
  );
}


function getFixedTitle(item) {
  return (
    item?.title ||
    item?.name ||
    item?.taskTitle ||
    item?.label ||
    "固定予定"
  );
}


/*
  固定予定を正規化
*/
function normalizeFixedSchedules(
  fixedSchedules
) {
  return (
    Array.isArray(fixedSchedules)
      ? fixedSchedules
      : []
  )
    .map((item) => {
      const start = toMinutes(
        getFixedStart(item)
      );

      const end = toMinutes(
        getFixedEnd(item)
      );

      if (
        start === null ||
        end === null ||
        end <= start
      ) {
        return null;
      }

      return {
        start,
        end,
        title: getFixedTitle(item),
      };
    })
    .filter(Boolean)
    .sort(
      (a, b) => a.start - b.start
    );
}


/* ========================================
   時間帯処理
======================================== */

function mergeIntervals(intervals) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start
  );

  const merged = [
    {
      ...sorted[0],
    },
  ];

  for (
    let i = 1;
    i < sorted.length;
    i++
  ) {
    const current = sorted[i];
    const last =
      merged[merged.length - 1];

    if (
      current.start <= last.end
    ) {
      last.end = Math.max(
        last.end,
        current.end
      );
    } else {
      merged.push({
        ...current,
      });
    }
  }

  return merged;
}


/*
  勉強可能時間を取得

  曜日別設定は使用しない。
  studyStart / studyEnd の
  全体設定だけを使用する。
*/
function getAvailableIntervals(
  settings,
  fixedSchedules
) {
  const startValue =
    settings?.studyStart ||
    settings?.startTime ||
    settings?.availableStart ||
    settings?.dayStart ||
    "07:00";

  const endValue =
    settings?.studyEnd ||
    settings?.endTime ||
    settings?.availableEnd ||
    settings?.dayEnd ||
    "23:00";

  const dayStart =
    toMinutes(startValue);

  const dayEnd =
    toMinutes(endValue);

  const actualStart =
    dayStart === null
      ? 7 * 60
      : dayStart;

  const actualEnd =
    dayEnd === null
      ? 23 * 60
      : dayEnd;

  if (actualEnd <= actualStart) {
    return [];
  }

  const fixed =
    fixedSchedules.filter(
      (item) =>
        item.end > actualStart &&
        item.start < actualEnd
    );

  const blocked =
    fixed.map((item) => ({
      start: Math.max(
        item.start,
        actualStart
      ),
      end: Math.min(
        item.end,
        actualEnd
      ),
    }));

  const merged =
    mergeIntervals(blocked);

  const intervals = [];

  let cursor = actualStart;

  for (const block of merged) {
    if (cursor < block.start) {
      intervals.push({
        start: cursor,
        end: block.start,
      });
    }

    cursor = Math.max(
      cursor,
      block.end
    );
  }

  if (cursor < actualEnd) {
    intervals.push({
      start: cursor,
      end: actualEnd,
    });
  }

  return intervals;
}


/* ========================================
   集中ブロック作成
======================================== */

/*
  集中型の学習ブロックを作る。

  基本：
    最大90分勉強
    10分休憩

  ただし、
  ・空き時間が短い
  ・タスクが短い

  場合は無理に90分にしない。
*/
function createStudyBlocks(intervals) {
  const blocks = [];

  const MAX_STUDY = 90;
  const BREAK = 10;

  for (const interval of intervals) {
    let cursor = interval.start;

    while (cursor < interval.end) {
      const remaining =
        interval.end - cursor;

      if (remaining <= 0) {
        break;
      }

      /*
        30分以下なら、
        そのまま最後まで勉強する。
      */
      if (remaining <= 30) {
        blocks.push({
          type: "study",
          start: cursor,
          end: interval.end,
        });

        cursor = interval.end;

        continue;
      }

      const studyLength =
        Math.min(
          MAX_STUDY,
          remaining
        );

      blocks.push({
        type: "study",
        start: cursor,
        end:
          cursor + studyLength,
      });

      cursor += studyLength;

      /*
        まだ時間が残っている場合のみ
        休憩を入れる。
      */
      if (cursor < interval.end) {
        const restLength =
          Math.min(
            BREAK,
            interval.end - cursor
          );

        /*
          5分未満しか残っていない場合は
          休憩ブロックを作らない。
        */
        if (restLength >= 5) {
          blocks.push({
            type: "break",
            start: cursor,
            end:
              cursor + restLength,
          });

          cursor += restLength;
        }
      }
    }
  }

  return blocks;
}


/* ========================================
   科目ごとの情報
======================================== */

function buildSubjectGroups(tasks) {
  const groups = new Map();

  for (const task of tasks) {
    const subject =
      task.subject || "その他";

    if (!groups.has(subject)) {
      groups.set(subject, {
        subject,
        tasks: [],
        totalMinutes: 0,
        maxPriority: 1,
        earliestDeadline: null,
      });
    }

    const group =
      groups.get(subject);

    group.tasks.push(task);

    group.totalMinutes +=
      task.remainingMinutes;

    group.maxPriority =
      Math.max(
        group.maxPriority,
        task.priority
      );

    const days =
      getDaysUntilDeadline(
        task.original
      );

    if (days !== null) {
      if (
        group.earliestDeadline === null ||
        days <
          group.earliestDeadline
      ) {
        group.earliestDeadline =
          days;
      }
    }
  }

  return [
    ...groups.values(),
  ];
}


/* ========================================
   タスクの優先度計算
======================================== */

/*
  「どの科目を先にやるか」を決める。

  優先順位：

  1. 期限が近い
  2. 優先度が高い
  3. 残り時間が多い
  4. 既に同じ科目を始めている
*/
function calculateTaskScore(
  task,
  context = {}
) {
  let score = 0;

  /*
    期限
  */
  const days =
    getDaysUntilDeadline(
      task.original
    );

  if (days !== null) {
    if (days <= 0) {
      score += 1000;
    } else if (days === 1) {
      score += 800;
    } else if (days === 2) {
      score += 650;
    } else if (days <= 4) {
      score += 500;
    } else if (days <= 7) {
      score += 350;
    } else {
      score += 150;
    }
  }

  /*
    優先度
  */
  score +=
    task.priority * 100;

  /*
    残り時間が多いものを少し優先
  */
  score += Math.min(
    task.remainingMinutes,
    180
  ) * 0.2;

  /*
    現在集中している科目なら
    継続ボーナス
  */
  if (
    context.currentSubject &&
    context.currentSubject ===
      task.subject
  ) {
    score += 120;
  }

  /*
    まだ今日選ばれていない科目なら
    少しボーナス。

    これによって、

      数学
      英語
      理科

    のように2〜3科目へ
    広げやすくなる。
  */
  if (
    context.usedSubjects &&
    !context.usedSubjects.has(
      task.subject
    )
  ) {
    score += 80;
  }

  return score;
}


/*
  科目を選択
*/
function chooseNextTask(
  tasks,
  context
) {
  const available =
    tasks.filter(
      (task) =>
        task.remainingMinutes > 0
    );

  if (available.length === 0) {
    return null;
  }

  const scored =
    available.map((task) => ({
      task,
      score:
        calculateTaskScore(
          task,
          context
        ),
    }));

  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (
      b.task.priority !==
      a.task.priority
    ) {
      return (
        b.task.priority -
        a.task.priority
      );
    }

    return (
      b.task.remainingMinutes -
      a.task.remainingMinutes
    );
  });

  return scored[0].task;
}


/* ========================================
   理由
======================================== */

function buildReason(
  task,
  context = {}
) {
  const days =
    getDaysUntilDeadline(
      task.original
    );

  if (days !== null && days <= 0) {
    return (
      "期限が近いため、最優先で配置しました。"
    );
  }

  if (days === 1) {
    return (
      "期限が明日に近づいているため、優先して配置しました。"
    );
  }

  if (task.priority >= 5) {
    return (
      "優先度が最も高いため、先に配置しました。"
    );
  }

  if (task.priority >= 4) {
    return (
      "優先度が高いため、早めに配置しました。"
    );
  }

  if (
    context.currentSubject ===
    task.subject
  ) {
    return (
      "同じ科目を続けて学習し、集中しやすいように配置しました。"
    );
  }

  return (
    "期限・優先度・残り時間を考慮して配置しました。"
  );
}


/* ========================================
   メイン
======================================== */

export function generateAutoPlan({
  tasks = [],
  fixedSchedules = [],
  settings = {},
}) {
  /*
    固定予定
  */
  const normalizedFixed =
    normalizeFixedSchedules(
      fixedSchedules
    );

  /*
    勉強可能時間
  */
  const availableIntervals =
    getAvailableIntervals(
      settings,
      normalizedFixed
    );

  /*
    集中ブロック
  */
  const studyBlocks =
    createStudyBlocks(
      availableIntervals
    );


  /* ======================================
     タスクを正規化
  ====================================== */

  const normalizedTasks =
    (Array.isArray(tasks)
      ? tasks
      : []
    )
      .filter((task) => {
        if (!task) {
          return false;
        }

        if (isCompleted(task)) {
          return false;
        }

        return (
          getRemainingMinutes(task) >
          0
        );
      })
      .map((task, index) => ({
        original: task,
        index,

        title:
          getTaskTitle(task),

        subject:
          getSubject(task),

        minutes:
          getMinutes(task),

        studiedMinutes:
          getStudiedMinutes(task),

        remainingMinutes:
          getRemainingMinutes(task),

        priority:
          getPriority(task),

        deadline:
          getDeadline(task),
      }));


  /*
    科目グループ
  */
  const subjectGroups =
    buildSubjectGroups(
      normalizedTasks
    );


  /*
    結果
  */
  const plan = [];


  /* ======================================
     固定予定を追加
  ====================================== */

  for (
    const fixed of normalizedFixed
  ) {
    plan.push({
      start:
        toTime(fixed.start),

      end:
        toTime(fixed.end),

      type: "fixed",

      taskTitle:
        fixed.title,

      subject: "",

      minutes:
        fixed.end -
        fixed.start,

      reason:
        "固定予定",

      _start:
        fixed.start,
    });
  }


  /* ======================================
     学習計画
  ====================================== */

  const workingTasks =
    normalizedTasks.map(
      (task) => ({
        ...task,
      })
    );


  /*
    1日に集中する科目数

    基本2〜3科目。
  */
  const MAX_SUBJECTS_PER_DAY = 3;


  /*
    1科目をなるべく続ける時間

    90分を上限にする。
  */
  const TARGET_SUBJECT_BLOCK = 90;


  /*
    今日すでに使った科目
  */
  const usedSubjects =
    new Set();


  /*
    現在集中している科目
  */
  let currentSubject = null;


  /*
    現在の科目の連続時間
  */
  let currentSubjectMinutes = 0;


  /*
    学習セッション数
  */
  let studySessionCount = 0;


  /*
    今日使う科目の最大数
  */
  const subjectLimit =
    Math.min(
      MAX_SUBJECTS_PER_DAY,
      Math.max(
        1,
        subjectGroups.length
      )
    );


  /*
    すべての学習ブロックを処理
  */
  for (
    let blockIndex = 0;
    blockIndex <
      studyBlocks.length;
    blockIndex++
  ) {
    const block =
      studyBlocks[blockIndex];


    /* ====================================
       休憩
    ==================================== */

    if (
      block.type === "break"
    ) {
      /*
        後ろに勉強ブロックがある場合のみ
        休憩を表示する。
      */
      const nextStudyExists =
        studyBlocks.some(
          (nextBlock, index) =>
            index >
              blockIndex &&
            nextBlock.type ===
              "study"
        );

      if (
        nextStudyExists
      ) {
        plan.push({
          start:
            toTime(block.start),

          end:
            toTime(block.end),

          type: "break",

          taskTitle:
            "休憩",

          subject: "",

          minutes:
            block.end -
            block.start,

          reason:
            "集中力を維持するための休憩です。",

          _start:
            block.start,
        });
      }

      continue;
    }


    /* ====================================
       学習ブロック
    ==================================== */

    let cursor =
      block.start;

    let available =
      block.end -
      block.start;


    while (
      available > 0
    ) {
      /*
        残っているタスクがない
      */
      const remainingTasks =
        workingTasks.filter(
          (task) =>
            task.remainingMinutes >
            0
        );

      if (
        remainingTasks.length === 0
      ) {
        break;
      }


      /*
        現在の科目を優先

        ただし、1科目を90分程度続けたら
        他の科目へ切り替えやすくする。
      */
      let selectedTask =
        null;


      /*
        現在科目があり、
        まだ十分に集中していない場合
      */
      if (
        currentSubject &&
        currentSubjectMinutes <
          TARGET_SUBJECT_BLOCK
      ) {
        const sameSubjectTasks =
          remainingTasks.filter(
            (task) =>
              task.subject ===
              currentSubject
          );

        if (
          sameSubjectTasks.length >
          0
        ) {
          selectedTask =
            chooseNextTask(
              sameSubjectTasks,
              {
                currentSubject,
                usedSubjects,
              }
            );
        }
      }


      /*
        現在科目を続けられない場合
        新しい科目を探す
      */
      if (!selectedTask) {
        /*
          まだ2〜3科目に達していない場合は
          新しい科目を選びやすくする。
        */
        const unusedSubjects =
          remainingTasks.filter(
            (task) =>
              !usedSubjects.has(
                task.subject
              )
          );


        if (
          usedSubjects.size <
            subjectLimit &&
          unusedSubjects.length > 0
        ) {
          selectedTask =
            chooseNextTask(
              unusedSubjects,
              {
                currentSubject,
                usedSubjects,
              }
            );
        }


        /*
          新しい科目を選べない場合は
          今までの科目から選ぶ。
        */
        if (!selectedTask) {
          selectedTask =
            chooseNextTask(
              remainingTasks,
              {
                currentSubject,
                usedSubjects,
              }
            );
        }
      }


      if (!selectedTask) {
        break;
      }


      /*
        1ブロックで使える時間
      */
      const remainingForTask =
        selectedTask.remainingMinutes;


      /*
        基本はブロックいっぱい使う。

        ただし、
        タスクが残り30分しかないなら
        30分で終了する。
      */
      const useMinutes =
        Math.min(
          available,
          remainingForTask
        );


      const end =
        cursor +
        useMinutes;


      /*
        科目変更
      */
      if (
        currentSubject !==
        selectedTask.subject
      ) {
        currentSubject =
          selectedTask.subject;

        currentSubjectMinutes = 0;

        usedSubjects.add(
          selectedTask.subject
        );
      }


      /*
        学習計画追加
      */
      plan.push({
        start:
          toTime(cursor),

        end:
          toTime(end),

        type:
          "study",

        taskTitle:
          selectedTask.title,

        subject:
          selectedTask.subject,

        minutes:
          useMinutes,

        reason:
          buildReason(
            selectedTask,
            {
              currentSubject,
              usedSubjects,
            }
          ),

        _start:
          cursor,
      });


      /*
        カウンター
      */
      studySessionCount++;

      currentSubjectMinutes +=
        useMinutes;


      /*
        タスク残り時間
      */
      selectedTask.remainingMinutes -=
        useMinutes;


      /*
        ブロック残り
      */
      cursor = end;

      available -=
        useMinutes;


      /*
        タスクが終わった
      */
      if (
        selectedTask.remainingMinutes <=
        0
      ) {
        selectedTask.remainingMinutes =
          0;
      }


      /*
        1ブロックで90分程度続けたら
        次の科目へ移りやすくする。
      */
      if (
        currentSubjectMinutes >=
        TARGET_SUBJECT_BLOCK
      ) {
        currentSubject = null;

        currentSubjectMinutes = 0;
      }


      /*
        現在のブロックを使い切った
      */
      if (
        available <= 0
      ) {
        break;
      }
    }
  }


  /* ======================================
     残ったタスク
  ====================================== */

  const remainingTasks = [];

  for (
    const task of workingTasks
  ) {
    if (
      task.remainingMinutes <=
      0
    ) {
      continue;
    }

    remainingTasks.push({
      title:
        task.title,

      subject:
        task.subject,

      minutes:
        task.remainingMinutes,

      reason:
        "今日の勉強可能時間に入りきらなかったため、次回以降に回します。",
    });
  }


  /*
    優先度・期限順
  */
  remainingTasks.sort(
    (a, b) => {
      const taskA =
        workingTasks.find(
          (task) =>
            task.title ===
            a.title &&
            task.subject ===
            a.subject
        );

      const taskB =
        workingTasks.find(
          (task) =>
            task.title ===
            b.title &&
            task.subject ===
            b.subject
        );

      if (
        taskA &&
        taskB &&
        taskA.priority !==
          taskB.priority
      ) {
        return (
          taskB.priority -
          taskA.priority
        );
      }

      return (
        b.minutes -
        a.minutes
      );
    }
  );


  /* ======================================
     時刻順
  ====================================== */

  plan.sort(
    (a, b) =>
      a._start -
      b._start
  );


  /*
    内部用 _start を削除
  */
  const cleanPlan =
    plan.map(
      ({
        _start,
        ...item
      }) => item
    );


  /* ======================================
     合計時間
  ====================================== */

  const totalStudyMinutes =
    cleanPlan
      .filter(
        (item) =>
          item.type ===
          "study"
      )
      .reduce(
        (sum, item) =>
          sum + item.minutes,
        0
      );


  const totalAvailableMinutes =
    availableIntervals.reduce(
      (sum, interval) =>
        sum +
        (interval.end -
          interval.start),
      0
    );


  /*
    使用した科目
  */
  const plannedSubjects =
    [
      ...new Set(
        cleanPlan
          .filter(
            (item) =>
              item.type ===
              "study"
          )
          .map(
            (item) =>
              item.subject
          )
          .filter(Boolean)
      ),
    ];


  /* ======================================
     サマリー
  ====================================== */

  let summary = "";


  if (
    normalizedTasks.length ===
    0
  ) {
    summary =
      "未完了の学習タスクがありません。新しいタスクを登録すると自動で計画できます。";
  } else if (
    totalStudyMinutes ===
    0
  ) {
    summary =
      "今日の勉強可能時間がないため、学習計画を作成できませんでした。";
  } else if (
    remainingTasks.length >
    0
  ) {
    summary =
      `${plannedSubjects.length}科目を中心に、期限・優先度・残り時間を考慮して集中型の計画を作成しました。時間内に終わらないタスクは次回へ回しています。`;
  } else {
    summary =
      `${plannedSubjects.length}科目を中心に、まとまった時間で集中できるように学習計画を作成しました。`;
  }


  /* ======================================
     アドバイス
  ====================================== */

  let advice = "";


  if (
    totalAvailableMinutes <=
    0
  ) {
    advice =
      "固定予定などにより、現在設定されている時間帯に勉強可能時間がありません。";
  } else {
    advice =
      `今日の勉強可能時間は約${totalAvailableMinutes}分です。${totalStudyMinutes}分を学習に使用し、${plannedSubjects.length}科目を中心に集中して進めます。`;
  }


  /* ======================================
     科目別サマリー
  ====================================== */

  const subjectSummary =
    plannedSubjects.map(
      (subject) => {
        const minutes =
          cleanPlan
            .filter(
              (item) =>
                item.type ===
                  "study" &&
                item.subject ===
                  subject
            )
            .reduce(
              (sum, item) =>
                sum +
                item.minutes,
              0
            );

        return {
          subject,
          minutes,
        };
      }
    );


  /* ======================================
     結果
  ====================================== */

  return {
    summary,

    advice,

    plan:
      cleanPlan,

    remainingTasks,

    totalStudyMinutes,

    totalAvailableMinutes,

    studySessionCount,

    plannedSubjects,

    subjectSummary,
  };
}
