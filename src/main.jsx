import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// ============================================================
// StudyFlow Phase 2-②②
// ============================================================
//
// Phase 1
// ・今日のタスク
// ・タスク完了
// ・達成率
// ・タスク追加
// ・タスクごとのタイマー
// ・実績学習時間
// ・今日の時間割
// ・進捗表示
// ・localStorage保存
//
// Phase 2-①
// ・勉強開始時刻
// ・勉強終了時刻
// ・固定予定
// ・タスク優先度
// ・自動時間割
//
// Phase 2-②①
// ・起床時刻
// ・朝の支度時間
// ・自習室利用
// ・自習室への移動時間
// ・今日の勉強時間
// ・固定予定
// ・生活条件を時間割に反映
//
// Phase 2-②②
// ・勉強可能時間の自動計算
// ・朝の支度終了時刻を自動計算
// ・自習室利用時の移動時間を自動反映
// ・固定予定を除外した実質勉強可能時間を計算
// ・必要勉強時間と比較
// ・時間不足時の警告
// ・空き時間を自動検出
// ・空き時間に優先度順でタスクを自動配置
//
// Supabaseはまだ使用しません。
// ============================================================


// ============================================================
// localStorage
// ============================================================

const STORAGE_KEY = "studyflow_phase2_v3";


// ============================================================
// 初期タスク
// ============================================================

const INITIAL_TASKS = [
  {
    id: "math",
    subject: "数学",
    title: "基礎問題精講 数III 積分",
    minutes: 60,
    priority: 5,
    done: false
  },
  {
    id: "english",
    subject: "英語",
    title: "Vintage / 英文法",
    minutes: 45,
    priority: 4,
    done: false
  },
  {
    id: "physics",
    subject: "物理",
    title: "セミナー物理",
    minutes: 45,
    priority: 3,
    done: false
  },
  {
    id: "chemistry",
    subject: "化学",
    title: "セミナー化学",
    minutes: 45,
    priority: 3,
    done: false
  },
  {
    id: "research",
    subject: "研究",
    title: "ギター音源・実験データ整理",
    minutes: 30,
    priority: 2,
    done: false
  }
];


// ============================================================
// 初期設定
// ============================================================

const INITIAL_SETTINGS = {
  // 起床
  wakeUpTime: "07:00",

  // 朝の支度
  morningPrepMinutes: 70,

  // 自習室
  useStudyRoom: false,

  // 自習室までの移動
  travelMinutes: 40,

  // 勉強時間の基本範囲
  studyStart: "14:00",
  studyEnd: "19:20",

  // 固定予定
  fixedSchedules: []
};


// ============================================================
// データ読み込み
// ============================================================

function loadData() {

  try {

    const saved =
      JSON.parse(
        localStorage.getItem(
          STORAGE_KEY
        )
      );

    if (
      saved &&
      saved.tasks
    ) {

      return {

        tasks:
          saved.tasks,

        actualMinutes:
          saved.actualMinutes || 0,

        history:
          saved.history || [],

        settings: {
          ...INITIAL_SETTINGS,
          ...(saved.settings || {})
        }

      };

    }

  } catch (error) {

    console.error(
      "データ読み込みエラー:",
      error
    );

  }


  return {

    tasks:
      INITIAL_TASKS,

    actualMinutes:
      0,

    history:
      [],

    settings:
      INITIAL_SETTINGS

  };

}


// ============================================================
// データ保存
// ============================================================

function saveData(data) {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );

}


// ============================================================
// 今日の日付
// ============================================================

function getTodayLabel() {

  return new Intl.DateTimeFormat(
    "ja-JP",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }
  ).format(new Date());

}


// ============================================================
// 時刻 → 分
// ============================================================

function timeToMinutes(time) {

  if (!time) {
    return 0;
  }

  const [
    hours,
    minutes
  ] =
    time
      .split(":")
      .map(Number);

  return (
    hours * 60 +
    minutes
  );

}


// ============================================================
// 分 → 時刻
// ============================================================

function formatTime(minutes) {

  const normalized =
    ((minutes % 1440) + 1440) %
    1440;

  const hours =
    Math.floor(
      normalized / 60
    );

  const mins =
    normalized % 60;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(mins).padStart(2, "0")
  );

}


// ============================================================
// 分 → 「○時間○分」
// ============================================================

function formatDuration(minutes) {

  const value =
    Math.max(
      0,
      Math.round(
        Number(minutes) || 0
      )
    );

  const hours =
    Math.floor(
      value / 60
    );

  const mins =
    value % 60;

  if (hours === 0) {
    return `${mins}分`;
  }

  if (mins === 0) {
    return `${hours}時間`;
  }

  return `${hours}時間${mins}分`;

}


// ============================================================
// タイマー表示
// ============================================================

function formatTimer(
  totalSeconds
) {

  const minutes =
    Math.floor(
      totalSeconds / 60
    );

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );

}


// ============================================================
// 固定予定を分形式に変換
// ============================================================

function normalizeFixedSchedules(
  settings
) {

  return (
    settings.fixedSchedules ||
    []
  )
    .map(
      (schedule) => ({

        ...schedule,

        startMinutes:
          timeToMinutes(
            schedule.start
          ),

        endMinutes:
          timeToMinutes(
            schedule.end
          ),

        type:
          "fixed"

      })
    )
    .filter(
      (schedule) =>
        schedule.endMinutes >
        schedule.startMinutes
    )
    .sort(
      (a, b) =>
        a.startMinutes -
        b.startMinutes
    );

}


// ============================================================
// Phase 2-②②
// 勉強可能時間を自動計算
// ============================================================

function calculateStudyAvailability(
  settings
) {

  // ----------------------------------------------------------
  // 起床
  // ----------------------------------------------------------

  const wakeUp =
    timeToMinutes(
      settings.wakeUpTime
    );


  // ----------------------------------------------------------
  // 朝の支度終了
  // ----------------------------------------------------------

  const morningPrepEnd =
    wakeUp +
    Number(
      settings.morningPrepMinutes
    || 0
    );


  // ----------------------------------------------------------
  // 基本の勉強開始・終了
  // ----------------------------------------------------------

  const requestedStart =
    timeToMinutes(
      settings.studyStart
    );

  const requestedEnd =
    timeToMinutes(
      settings.studyEnd
    );


  // ----------------------------------------------------------
  // 実際に勉強を開始できる時刻
  //
  // 起床直後ではなく、
  // 朝の支度が終わった後から勉強可能。
  //
  // さらに自習室を使う場合は
  // 移動時間を考慮する。
  // ----------------------------------------------------------

  const travel =
    settings.useStudyRoom
      ? Number(
          settings.travelMinutes
        ) || 0
      : 0;


  const possibleStart =
    morningPrepEnd +
    travel;


  const actualStart =
    Math.max(
      requestedStart,
      possibleStart
    );


  // ----------------------------------------------------------
  // 終了時刻
  // ----------------------------------------------------------

  const actualEnd =
    requestedEnd;


  // ----------------------------------------------------------
  // 基本勉強時間
  // ----------------------------------------------------------

  const totalWindowMinutes =
    Math.max(
      0,
      actualEnd -
      actualStart
    );


  // ----------------------------------------------------------
  // 固定予定
  // ----------------------------------------------------------

  const fixedSchedules =
    normalizeFixedSchedules(
      settings
    );


  // ----------------------------------------------------------
  // 勉強時間帯に重なる固定予定だけ取得
  // ----------------------------------------------------------

  const relevantFixedSchedules =
    fixedSchedules
      .map(
        (schedule) => {

          const overlapStart =
            Math.max(
              actualStart,
              schedule.startMinutes
            );

          const overlapEnd =
            Math.min(
              actualEnd,
              schedule.endMinutes
            );

          return {

            ...schedule,

            overlapStart,

            overlapEnd,

            overlapMinutes:
              Math.max(
                0,
                overlapEnd -
                overlapStart
              )

          };

        }
      )
      .filter(
        (schedule) =>
          schedule.overlapMinutes >
          0
      );


  // ----------------------------------------------------------
  // 固定予定の合計時間
  // ----------------------------------------------------------

  const fixedMinutes =
    relevantFixedSchedules.reduce(
      (
        total,
        schedule
      ) =>
        total +
        schedule.overlapMinutes,
      0
    );


  // ----------------------------------------------------------
  // 実質勉強可能時間
  // ----------------------------------------------------------

  const availableMinutes =
    Math.max(
      0,
      totalWindowMinutes -
      fixedMinutes
    );


  // ----------------------------------------------------------
  // 空き時間を作る
  // ----------------------------------------------------------

  const freeSlots = [];

  let cursor =
    actualStart;


  for (
    const schedule
    of relevantFixedSchedules
  ) {

    const fixedStart =
      Math.max(
        schedule.startMinutes,
        actualStart
      );

    const fixedEnd =
      Math.min(
        schedule.endMinutes,
        actualEnd
      );


    // 固定予定より前に空きがある
    if (
      fixedStart >
      cursor
    ) {

      freeSlots.push({

        start:
          cursor,

        end:
          fixedStart,

        minutes:
          fixedStart -
          cursor

      });

    }


    cursor =
      Math.max(
        cursor,
        fixedEnd
      );

  }


  // 最後の固定予定の後
  if (
    cursor <
    actualEnd
  ) {

    freeSlots.push({

      start:
        cursor,

      end:
        actualEnd,

      minutes:
        actualEnd -
        cursor

    });

  }


  return {

    wakeUp,

    morningPrepEnd,

    travel,

    requestedStart,

    requestedEnd,

    actualStart,

    actualEnd,

    totalWindowMinutes,

    fixedMinutes,

    availableMinutes,

    fixedSchedules:
      relevantFixedSchedules,

    freeSlots

  };

}


// ============================================================
// 自動時間割生成
// ============================================================

function createAutoSchedule(
  tasks,
  settings
) {

  const availability =
    calculateStudyAvailability(
      settings
    );


  const {
    actualStart,
    actualEnd,
    fixedSchedules
  } =
    availability;


  if (
    actualEnd <=
    actualStart
  ) {

    return [];

  }


  // ----------------------------------------------------------
  // 未完了タスク
  // 優先度 → 時間の長い順
  // ----------------------------------------------------------

  const unscheduledTasks =
    tasks
      .filter(
        (task) =>
          !task.done
      )
      .sort(
        (a, b) => {

          if (
            Number(b.priority) !==
            Number(a.priority)
          ) {

            return (
              Number(b.priority) -
              Number(a.priority)
            );

          }

          return (
            Number(b.minutes) -
            Number(a.minutes)
          );

        }
      );


  const result = [];


  // ----------------------------------------------------------
  // 空き時間をコピー
  // ----------------------------------------------------------

  const freeSlots =
    availability.freeSlots.map(
      (slot) => ({
        ...slot
      })
    );


  // ----------------------------------------------------------
  // タスクを配置
  // ----------------------------------------------------------

  for (
    const task
    of unscheduledTasks
  ) {

    let remaining =
      Number(task.minutes) || 30;


    // タスクを1つの空き時間に
    // できるだけまとめて配置
    for (
      let i = 0;
      i < freeSlots.length;
      i++
    ) {

      const slot =
        freeSlots[i];


      if (
        slot.minutes <= 0
      ) {

        continue;

      }


      if (
        remaining <=
        slot.minutes
      ) {

        const start =
          slot.start;

        const end =
          start +
          remaining;


        result.push({

          ...task,

          start,

          end,

          minutes:
            remaining,

          type:
            "task"

        });


        slot.start =
          end;

        slot.minutes =
          slot.end -
          slot.start;


        remaining =
          0;

        break;

      }


      // ------------------------------------------------------
      // 空き時間に入り切らない場合
      // 分割して配置
      // ------------------------------------------------------

      const start =
        slot.start;

      const end =
        slot.end;


      result.push({

        ...task,

        start,

        end,

        minutes:
          slot.minutes,

        type:
          "task",

        split:
          true

      });


      remaining -=
        slot.minutes;


      slot.start =
        slot.end;

      slot.minutes =
        0;

    }

  }


  // ----------------------------------------------------------
  // 固定予定を追加
  // ----------------------------------------------------------

  return [

    ...result,

    ...fixedSchedules.map(
      (schedule) => ({

        ...schedule,

        start:
          schedule.overlapStart,

        end:
          schedule.overlapEnd,

        type:
          "fixed"

      })
    )

  ]
    .filter(
      (item) =>
        item.end >
        item.start
    )
    .sort(
      (a, b) =>
        a.start -
        b.start
    );

}


// ============================================================
// メイン
// ============================================================

function App() {

  // ----------------------------------------------------------
  // State
  // ----------------------------------------------------------

  const [
    data,
    setData
  ] = useState(
    loadData
  );


  const [
    tab,
    setTab
  ] = useState(
    "today"
  );


  const [
    runningId,
    setRunningId
  ] = useState(null);


  const [
    seconds,
    setSeconds
  ] = useState(0);


  const [
    newTitle,
    setNewTitle
  ] = useState("");


  const [
    newMinutes,
    setNewMinutes
  ] = useState(30);


  // ----------------------------------------------------------
  // 固定予定
  // ----------------------------------------------------------

  const [
    fixedTitle,
    setFixedTitle
  ] = useState("");


  const [
    fixedStart,
    setFixedStart
  ] = useState("19:20");


  const [
    fixedEnd,
    setFixedEnd
  ] = useState("21:30");


  // ----------------------------------------------------------
  // 保存
  // ----------------------------------------------------------

  useEffect(() => {

    saveData(data);

  }, [data]);


  // ----------------------------------------------------------
  // タイマー
  // ----------------------------------------------------------

  useEffect(() => {

    if (!runningId) {
      return;
    }


    const timer =
      setInterval(() => {

        setSeconds(
          (current) =>
            current + 1
        );

      }, 1000);


    return () => {

      clearInterval(
        timer
      );

    };

  }, [runningId]);


  // ==========================================================
  // 基本計算
  // ==========================================================

  const completedTasks =
    data.tasks.filter(
      (task) =>
        task.done
    ).length;


  const totalTasks =
    data.tasks.length;


  const progress =
    totalTasks === 0
      ? 0
      : Math.round(
          (
            completedTasks /
            totalTasks
          ) * 100
        );


  const plannedMinutes =
    data.tasks.reduce(
      (
        total,
        task
      ) =>
        total +
        Number(
          task.minutes
        ),
      0
    );


  const completedTaskMinutes =
    data.tasks
      .filter(
        (task) =>
          task.done
      )
      .reduce(
        (
          total,
          task
        ) =>
          total +
          Number(
            task.minutes
          ),
        0
      );


  const remainingTasks =
    data.tasks.filter(
      (task) =>
        !task.done
    );


  // ==========================================================
  // Phase 2-②②
  // 勉強可能時間
  // ==========================================================

  const availability =
    useMemo(
      () =>
        calculateStudyAvailability(
          data.settings
        ),
      [
        data.settings
      ]
    );


  // ==========================================================
  // 自動時間割
  // ==========================================================

  const todayPlan =
    useMemo(
      () =>
        createAutoSchedule(
          data.tasks,
          data.settings
        ),
      [
        data.tasks,
        data.settings
      ]
    );


  // ==========================================================
  // 未完了タスクの必要時間
  // ==========================================================

  const remainingMinutes =
    remainingTasks.reduce(
      (
        total,
        task
      ) =>
        total +
        Number(
          task.minutes
        ),
      0
    );


  const shortageMinutes =
    Math.max(
      0,
      remainingMinutes -
      availability.availableMinutes
    );


  const enoughTime =
    shortageMinutes === 0;


  // ==========================================================
  // 設定変更
  // ==========================================================

  function updateSetting(
    key,
    value
  ) {

    setData(
      (current) => ({

        ...current,

        settings: {

          ...current.settings,

          [key]:
            value

        }

      })
    );

  }


  // ==========================================================
  // タスク完了
  // ==========================================================

  function toggleTask(
    id
  ) {

    setData(
      (current) => ({

        ...current,

        tasks:
          current.tasks.map(
            (task) => {

              if (
                task.id !== id
              ) {

                return task;

              }


              return {

                ...task,

                done:
                  !task.done

              };

            }
          )

      })
    );

  }


  // ==========================================================
  // タイマー
  // ==========================================================

  function startTimer(
    task
  ) {

    // 同じタスク → 停止
    if (
      runningId ===
      task.id
    ) {

      const earnedMinutes =
        Math.max(
          1,
          Math.round(
            seconds / 60
          )
        );


      setData(
        (current) => ({

          ...current,

          actualMinutes:
            current.actualMinutes +
            earnedMinutes

        })
      );


      setRunningId(
        null
      );

      setSeconds(
        0
      );

      return;

    }


    // 別タスクが動いている
    if (
      runningId
    ) {

      window.alert(
        "現在別のタスクのタイマーが動いています。先に停止してください。"
      );

      return;

    }


    setRunningId(
      task.id
    );

    setSeconds(
      0
    );

  }


  // ==========================================================
  // タスク追加
  // ==========================================================

  function addTask(
    event
  ) {

    event.preventDefault();


    if (
      !newTitle.trim()
    ) {

      return;

    }


    const newTask = {

      id:
        crypto.randomUUID(),

      subject:
        "追加",

      title:
        newTitle.trim(),

      minutes:
        Number(
          newMinutes
        ) || 30,

      priority:
        2,

      done:
        false

    };


    setData(
      (current) => ({

        ...current,

        tasks: [

          ...current.tasks,

          newTask

        ]

      })
    );


    setNewTitle("");

  }


  // ==========================================================
  // 優先度変更
  // ==========================================================

  function updatePriority(
    taskId,
    priority
  ) {

    setData(
      (current) => ({

        ...current,

        tasks:
          current.tasks.map(
            (task) => {

              if (
                task.id !==
                taskId
              ) {

                return task;

              }


              return {

                ...task,

                priority:
                  Number(
                    priority
                  )

              };

            }
          )

      })
    );

  }


  // ==========================================================
  // 固定予定追加
  // ==========================================================

  function addFixedSchedule(
    event
  ) {

    event.preventDefault();


    if (
      !fixedTitle.trim()
    ) {

      return;

    }


    if (
      timeToMinutes(
        fixedEnd
      ) <=
      timeToMinutes(
        fixedStart
      )
    ) {

      window.alert(
        "終了時刻は開始時刻より後にしてください。"
      );

      return;

    }


    const newSchedule = {

      id:
        crypto.randomUUID(),

      title:
        fixedTitle.trim(),

      start:
        fixedStart,

      end:
        fixedEnd

    };


    setData(
      (current) => ({

        ...current,

        settings: {

          ...current.settings,

          fixedSchedules: [

            ...(
              current.settings
                .fixedSchedules ||
              []
            ),

            newSchedule

          ]

        }

      })
    );


    setFixedTitle("");

  }


  // ==========================================================
  // 固定予定削除
  // ==========================================================

  function deleteFixedSchedule(
    id
  ) {

    setData(
      (current) => ({

        ...current,

        settings: {

          ...current.settings,

          fixedSchedules:
            (
              current.settings
                .fixedSchedules ||
              []
            ).filter(
              (schedule) =>
                schedule.id !==
                id
            )

        }

      })
    );

  }


  // ==========================================================
  // リセット
  // ==========================================================

  function resetData() {

    const answer =
      window.confirm(
        "StudyFlowの保存データをリセットしますか？"
      );


    if (!answer) {
      return;
    }


    setData({

      tasks:
        INITIAL_TASKS,

      actualMinutes:
        0,

      history:
        [],

      settings:
        INITIAL_SETTINGS

    });


    setRunningId(
      null
    );

    setSeconds(
      0
    );

  }


  // ==========================================================
  // JSX
  // ==========================================================

  return (

    <div className="app">

      {/* ======================================================
          HEADER
      ====================================================== */}

      <header className="header">

        <div className="headerInner">

          <div className="brand">
            📚 StudyFlow
          </div>


          <div className="date">
            {getTodayLabel()}
          </div>


          <h1>
            今日の勉強を、迷わず進める。
          </h1>


          <p>
            Phase 2：あなたの生活に合わせて時間割を作る
          </p>

        </div>

      </header>


      {/* ======================================================
          NAVIGATION
      ====================================================== */}

      <nav className="navigation">

        <button
          className={
            tab === "today"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setTab("today")
          }
        >
          今日
        </button>


        <button
          className={
            tab === "plan"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setTab("plan")
          }
        >
          時間割
        </button>


        <button
          className={
            tab === "progress"
              ? "navButton active"
              : "navButton"
          }
          onClick={() =>
            setTab("progress")
          }
        >
          進捗
        </button>

      </nav>


      <main className="main">

        {/* ====================================================
            TODAY
        ==================================================== */}

        {tab === "today" && (

          <>

            <section
              className="card heroCard"
            >

              <div className="row">

                <div>

                  <span className="eyebrow">
                    TODAY
                  </span>

                  <h2>
                    今日の達成状況
                  </h2>

                </div>


                <strong
                  className="bigNumber"
                >
                  {progress}%
                </strong>

              </div>


              <div className="progressBar">

                <span
                  style={{
                    width:
                      `${progress}%`
                  }}
                />

              </div>


              <p className="muted">

                {completedTasks}
                /
                {totalTasks}
                タスク完了

                {" ・ "}

                予定 {plannedMinutes}分

                {" ・ "}

                実績 {data.actualMinutes}分

              </p>

            </section>


            {/* ------------------------------------------------
                勉強可能時間
            ------------------------------------------------ */}

            <section className="card">

              <span className="eyebrow">
                AVAILABLE TIME
              </span>

              <h2>
                今日あとどれくらい勉強できる？
              </h2>


              <div
                className="statistics"
                style={{
                  marginTop:
                    "16px"
                }}
              >

                <div className="statCard">

                  <span>
                    勉強可能時間
                  </span>

                  <b>
                    {formatDuration(
                      availability.availableMinutes
                    )}
                  </b>

                </div>


                <div className="statCard">

                  <span>
                    残りタスク
                  </span>

                  <b>
                    {formatDuration(
                      remainingMinutes
                    )}
                  </b>

                </div>


                <div className="statCard">

                  <span>
                    差
                  </span>

                  <b>
                    {enoughTime
                      ? `+${formatDuration(
                          availability.availableMinutes -
                          remainingMinutes
                        )}`
                      : `-${formatDuration(
                          shortageMinutes
                        )}`}
                  </b>

                </div>

              </div>


              <div className="notice">

                <strong>
                  自動計算結果
                </strong>

                <br />

                {formatTime(
                  availability.actualStart
                )}
                から
                {formatTime(
                  availability.actualEnd
                )}
                までが基本の時間帯です。

                <br />

                固定予定
                {formatDuration(
                  availability.fixedMinutes
                )}
                を除いて、

                <strong>
                  実際に勉強できる時間は
                  {" "}
                  {formatDuration(
                    availability.availableMinutes
                  )}
                </strong>
                です。

              </div>


              {!enoughTime && (

                <div
                  className="notice"
                  style={{
                    marginTop:
                      "12px"
                  }}
                >

                  ⚠️

                  <strong>
                    今日の勉強時間が
                    {formatDuration(
                      shortageMinutes
                    )}
                    足りません。
                  </strong>

                  <br />

                  優先度の高いタスクから
                  自動的に時間割へ配置しています。

                </div>

              )}

            </section>


            {/* ------------------------------------------------
                タスク
            ------------------------------------------------ */}

            <section className="card">

              <div className="row">

                <h2>
                  今日やること
                </h2>

                <span className="muted">
                  {remainingTasks.length}件残り
                </span>

              </div>


              <div className="tasks">

                {data.tasks.map(
                  (task) => (

                    <div
                      key={task.id}
                      className={
                        task.done
                          ? "task done"
                          : "task"
                      }
                    >

                      <input
                        type="checkbox"
                        checked={
                          task.done
                        }
                        onChange={() =>
                          toggleTask(
                            task.id
                          )
                        }
                      />


                      <div className="taskMain">

                        <span className="tag">
                          {task.subject}
                        </span>


                        <div className="taskTitle">
                          {task.title}
                        </div>


                        <div className="muted">
                          {task.minutes}分
                        </div>

                      </div>


                      <div
                        style={{
                          display:
                            "flex",
                          flexDirection:
                            "column",
                          alignItems:
                            "flex-end",
                          gap:
                            "4px"
                        }}
                      >

                        <select
                          value={
                            task.priority
                          }
                          onChange={(
                            event
                          ) =>
                            updatePriority(
                              task.id,
                              event.target.value
                            )
                          }
                          aria-label="優先度"
                          style={{
                            width:
                              "auto",
                            minWidth:
                              "52px"
                          }}
                        >

                          <option value="5">
                            優先5
                          </option>

                          <option value="4">
                            優先4
                          </option>

                          <option value="3">
                            優先3
                          </option>

                          <option value="2">
                            優先2
                          </option>

                          <option value="1">
                            優先1
                          </option>

                        </select>


                        <button
                          className="timerButton"
                          onClick={() =>
                            startTimer(
                              task
                            )
                          }
                        >

                          {runningId ===
                          task.id

                            ? `停止 ${formatTimer(
                                seconds
                              )}`

                            : "開始"}

                        </button>

                      </div>

                    </div>

                  )
                )}

              </div>

            </section>


            {/* ------------------------------------------------
                タスク追加
            ------------------------------------------------ */}

            <section className="card">

              <h2>
                タスクを追加
              </h2>


              <form
                className="addForm"
                onSubmit={
                  addTask
                }
              >

                <input
                  value={newTitle}
                  onChange={(
                    event
                  ) =>
                    setNewTitle(
                      event.target.value
                    )
                  }
                  placeholder="例：早稲田 英語過去問"
                />


                <input
                  type="number"
                  min="5"
                  step="5"
                  value={
                    newMinutes
                  }
                  onChange={(
                    event
                  ) =>
                    setNewMinutes(
                      event.target.value
                    )
                  }
                />


                <button
                  className="primaryButton"
                  type="submit"
                >
                  追加
                </button>

              </form>

            </section>

          </>

        )}


        {/* ====================================================
            PLAN
        ==================================================== */}

        {tab === "plan" && (

          <>

            {/* ------------------------------------------------
                今日の条件
            ------------------------------------------------ */}

            <section className="card">

              <div className="row">

                <div>

                  <span className="eyebrow">
                    TODAY SETTINGS
                  </span>

                  <h2>
                    今日の条件
                  </h2>

                </div>

              </div>


              <p className="muted">

                生活条件を入力すると、
                StudyFlowが勉強可能時間を自動計算します。

              </p>


              {/* 起床 */}

              <div
                style={{
                  marginTop:
                    "18px"
                }}
              >

                <label>

                  <strong>
                    起床時刻
                  </strong>

                  <input
                    type="time"
                    value={
                      data.settings
                        .wakeUpTime
                    }
                    onChange={(
                      event
                    ) =>
                      updateSetting(
                        "wakeUpTime",
                        event.target.value
                      )
                    }
                    style={{
                      display:
                        "block",
                      marginTop:
                        "6px"
                    }}
                  />

                </label>

              </div>


              {/* 朝の支度 */}

              <div
                style={{
                  marginTop:
                    "18px"
                }}
              >

                <label>

                  <strong>
                    朝の支度時間
                  </strong>

                  <div
                    style={{
                      display:
                        "flex",
                      alignItems:
                        "center",
                      gap:
                        "8px",
                      marginTop:
                        "6px"
                    }}
                  >

                    <input
                      type="number"
                      min="0"
                      step="5"
                      value={
                        data.settings
                          .morningPrepMinutes
                      }
                      onChange={(
                        event
                      ) =>
                        updateSetting(
                          "morningPrepMinutes",
                          Number(
                            event.target.value
                          )
                        )
                      }
                      style={{
                        width:
                          "90px"
                      }}
                    />

                    <span>
                      分
                    </span>

                  </div>

                </label>

              </div>


              {/* 自習室 */}

              <div
                style={{
                  marginTop:
                    "18px"
                }}
              >

                <label
                  style={{
                    display:
                      "flex",
                    alignItems:
                      "center",
                    gap:
                      "10px"
                  }}
                >

                  <input
                    type="checkbox"
                    checked={
                      data.settings
                        .useStudyRoom
                    }
                    onChange={(
                      event
                    ) =>
                      updateSetting(
                        "useStudyRoom",
                        event.target.checked
                      )
                    }
                  />

                  <strong>
                    自習室へ行く
                  </strong>

                </label>

              </div>


              {/* 移動時間 */}

              {data.settings
                .useStudyRoom && (

                <div
                  style={{
                    marginTop:
                      "18px"
                  }}
                >

                  <label>

                    <strong>
                      自習室への移動時間
                    </strong>

                    <div
                      style={{
                        display:
                          "flex",
                        alignItems:
                          "center",
                        gap:
                          "8px",
                        marginTop:
                          "6px"
                      }}
                    >

                      <input
                        type="number"
                        min="0"
                        step="5"
                        value={
                          data.settings
                            .travelMinutes
                        }
                        onChange={(
                          event
                        ) =>
                          updateSetting(
                            "travelMinutes",
                            Number(
                              event.target.value
                            )
                          )
                        }
                        style={{
                          width:
                            "90px"
                        }}
                      />

                      <span>
                        分
                      </span>

                    </div>

                  </label>

                </div>

              )}


              {/* 基本時間帯 */}

              <div
                style={{
                  marginTop:
                    "18px"
                }}
              >

                <strong>
                  勉強時間の基本範囲
                </strong>


                <div
                  className="addForm"
                  style={{
                    marginTop:
                      "6px"
                  }}
                >

                  <label>

                    開始

                    <input
                      type="time"
                      value={
                        data.settings
                          .studyStart
                      }
                      onChange={(
                        event
                      ) =>
                        updateSetting(
                          "studyStart",
                          event.target.value
                        )
                      }
                    />

                  </label>


                  <label>

                    終了

                    <input
                      type="time"
                      value={
                        data.settings
                          .studyEnd
                      }
                      onChange={(
                        event
                      ) =>
                        updateSetting(
                          "studyEnd",
                          event.target.value
                        )
                      }
                    />

                  </label>

                </div>

              </div>


              {/* 自動計算結果 */}

              <div
                className="notice"
                style={{
                  marginTop:
                    "20px"
                }}
              >

                <strong>
                  📊 自動計算
                </strong>

                <br />
                起床：
                {formatTime(
                  availability.wakeUp
                )}

                <br />
                朝の支度終了：
                {formatTime(
                  availability.morningPrepEnd
                )}

                {availability.travel >
                  0 && (
                  <>
                    <br />
                    移動：
                    {availability.travel}分
                  </>
                )}

                <br />

                実際の勉強開始：
                <strong>
                  {" "}
                  {formatTime(
                    availability.actualStart
                  )}
                </strong>

                <br />

                勉強終了：
                <strong>
                  {" "}
                  {formatTime(
                    availability.actualEnd
                  )}
                </strong>

                <br />

                固定予定：
                {formatDuration(
                  availability.fixedMinutes
                )}

                <br />

                <strong>
                  実質勉強可能時間：
                  {" "}
                  {formatDuration(
                    availability.availableMinutes
                  )}
                </strong>

              </div>

            </section>


            {/* ------------------------------------------------
                朝のスケジュール
            ------------------------------------------------ */}

            <section className="card">

              <span className="eyebrow">
                MORNING
              </span>

              <h2>
                朝のスケジュール
              </h2>


              <div className="schedule">

                <div className="scheduleItem">

                  <div className="scheduleTime">

                    {data.settings
                      .wakeUpTime}

                  </div>

                  <div>

                    <strong>
                      起床
                    </strong>

                    <small>
                      1日のスタート
                    </small>

                  </div>

                </div>


                <div className="scheduleItem">

                  <div className="scheduleTime">

                    {formatTime(
                      availability.morningPrepEnd
                    )}

                  </div>

                  <div>

                    <strong>
                      朝の支度終了
                    </strong>

                    <small>
                      支度
                      {data.settings
                        .morningPrepMinutes}
                      分
                    </small>

                  </div>

                </div>


                {availability.travel >
                  0 && (

                  <div className="scheduleItem">

                    <div className="scheduleTime">

                      {formatTime(
                        availability.actualStart
                      )}

                    </div>

                    <div>

                      <strong>
                        自習室到着・勉強開始
                      </strong>

                      <small>
                        移動
                        {availability.travel}
                        分を考慮
                      </small>

                    </div>

                  </div>

                )}

              </div>


              <div className="notice">

                起床 →
                朝の支度 →
                {availability.travel >
                0
                  ? "移動 → "
                  : ""}
                勉強開始

                の順番で自動計算しています。

              </div>

            </section>


            {/* ------------------------------------------------
                固定予定
            ------------------------------------------------ */}

            <section className="card">

              <div className="row">

                <div>

                  <span className="eyebrow">
                    FIXED
                  </span>

                  <h2>
                    固定予定
                  </h2>

                </div>

              </div>


              <p className="muted">

                塾・学校・部活など、
                動かせない予定を登録します。
                登録した時間は勉強可能時間から自動的に除外されます。

              </p>


              <form
                className="addForm"
                onSubmit={
                  addFixedSchedule
                }
              >

                <input
                  value={
                    fixedTitle
                  }
                  onChange={(
                    event
                  ) =>
                    setFixedTitle(
                      event.target.value
                    )
                  }
                  placeholder="例：塾"
                />


                <input
                  type="time"
                  value={
                    fixedStart
                  }
                  onChange={(
                    event
                  ) =>
                    setFixedStart(
                      event.target.value
                    )
                  }
                />


                <input
                  type="time"
                  value={
                    fixedEnd
                  }
                  onChange={(
                    event
                  ) =>
                    setFixedEnd(
                      event.target.value
                    )
                  }
                />


                <button
                  className="primaryButton"
                  type="submit"
                >
                  追加
                </button>

              </form>


              {(
                data.settings
                  .fixedSchedules ||
                []
              ).length > 0 && (

                <div
                  style={{
                    marginTop:
                      "16px"
                  }}
                >

                  {data.settings
                    .fixedSchedules
                    .map(
                      (
                        schedule
                      ) => (

                        <div
                          key={
                            schedule.id
                          }
                          className="scheduleItem"
                          style={{
                            marginBottom:
                              "8px"
                          }}
                        >

                          <div className="scheduleTime">

                            {
                              schedule.start
                            }
                            {"–"}
                            {
                              schedule.end
                            }

                          </div>


                          <div
                            style={{
                              flex:
                                1
                            }}
                          >

                            <strong>
                              {
                                schedule.title
                              }
                            </strong>

                          </div>


                          <button
                            className="dangerButton"
                            onClick={() =>
                              deleteFixedSchedule(
                                schedule.id
                              )
                            }
                          >
                            削除
                          </button>

                        </div>

                      )
                    )}

                </div>

              )}

            </section>


            {/* ------------------------------------------------
                自動時間割
            ------------------------------------------------ */}

            <section className="card">

              <div className="row">

                <div>

                  <span className="eyebrow">
                    AUTO PLAN
                  </span>

                  <h2>
                    今日の時間割
                  </h2>

                </div>

                <span className="muted">
                  優先度順
                </span>

              </div>


              <div className="schedule">

                {todayPlan.length ===
                0 ? (

                  <p className="muted">

                    現在の条件では、
                    配置できるタスクがありません。

                  </p>

                ) : (

                  todayPlan.map(
                    (item, index) => (

                      <div
                        key={
                          item.type ===
                          "fixed"
                            ? `fixed-${item.id}`
                            : `task-${item.id}-${index}`
                        }
                        className="scheduleItem"
                      >

                        <div className="scheduleTime">

                          {formatTime(
                            item.start
                          )}

                          {"–"}

                          {formatTime(
                            item.end
                          )}

                        </div>


                        <div>

                          <strong>

                            {item.type ===
                            "fixed"
                              ? `📌 ${item.title}`
                              : item.title}

                          </strong>


                          <small>

                            {item.type ===
                            "fixed"

                              ? "固定予定"

                              : `${item.subject} ・ ${item.minutes}分 ・ 優先度${item.priority}${item.split ? " ・ 分割" : ""}`}

                          </small>

                        </div>

                      </div>

                    )
                  )

                )}

              </div>


              <div className="notice">

                <strong>
                  自動計画の仕組み
                </strong>

                <br />

                ① 起床・朝の支度・移動時間から
                勉強開始可能時刻を計算

                <br />

                ② 固定予定を勉強時間から除外

                <br />

                ③ 残った空き時間を計算

                <br />

                ④ 優先度の高いタスクから順番に配置

                <br />

                ⑤ 入り切らないタスクは
                自動的に分割

              </div>

            </section>

          </>

        )}


        {/* ====================================================
            PROGRESS
        ==================================================== */}

        {tab === "progress" && (

          <>

            <section className="statistics">

              <div className="statCard">

                <span>
                  完了タスク
                </span>

                <b>
                  {completedTasks}
                </b>

                <small>
                  / {totalTasks}
                </small>

              </div>


              <div className="statCard">

                <span>
                  予定学習時間
                </span>

                <b>
                  {plannedMinutes}
                </b>

                <small>
                  分
                </small>

              </div>


              <div className="statCard">

                <span>
                  実績学習時間
                </span>

                <b>
                  {data.actualMinutes}
                </b>

                <small>
                  分
                </small>

              </div>

            </section>


            {/* ------------------------------------------------
                勉強可能時間
            ------------------------------------------------ */}

            <section className="card">

              <h2>
                今日の時間分析
              </h2>


              <div className="schedule">

                <div className="scheduleItem">

                  <div className="scheduleTime">
                    {formatTime(
                      availability.actualStart
                    )}
                  </div>

                  <div>

                    <strong>
                      勉強開始可能
                    </strong>

                    <small>
                      朝の支度・移動を考慮
                    </small>

                  </div>

                </div>


                <div className="scheduleItem">

                  <div className="scheduleTime">
                    {formatTime(
                      availability.actualEnd
                    )}
                  </div>

                  <div>

                    <strong>
                      勉強終了
                    </strong>

                    <small>
                      設定した終了時刻
                    </small>

                  </div>

                </div>

              </div>


              <div className="statistics">

                <div className="statCard">

                  <span>
                    基本時間
                  </span>

                  <b>
                    {formatDuration(
                      availability.totalWindowMinutes
                    )}
                  </b>

                </div>


                <div className="statCard">

                  <span>
                    固定予定
                  </span>

                  <b>
                    {formatDuration(
                      availability.fixedMinutes
                    )}
                  </b>

                </div>


                <div className="statCard">

                  <span>
                    勉強可能
                  </span>

                  <b>
                    {formatDuration(
                      availability.availableMinutes
                    )}
                  </b>

                </div>

              </div>

            </section>


            <section className="card">

              <h2>
                今日の進捗
              </h2>


              <div className="progressBar large">

                <span
                  style={{
                    width:
                      `${progress}%`
                  }}
                />

              </div>


              <p>

                {completedTaskMinutes}
                分相当のタスクが
                完了しています。

              </p>

            </section>


            <section className="card">

              <h2>
                データ管理
              </h2>


              <p className="muted">

                StudyFlowでは、
                データをブラウザの
                localStorageに保存しています。

                <br />

                同じ端末・同じブラウザなら、
                ページを閉じてもデータは残ります。

              </p>


              <button
                className="dangerButton"
                onClick={
                  resetData
                }
              >
                StudyFlowデータをリセット
              </button>

            </section>

          </>

        )}

      </main>

    </div>

  );

}


// ============================================================
// React起動
// ============================================================

createRoot(
  document.getElementById("root")
).render(
  <App />
);
