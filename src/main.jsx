import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// StudyFlow Phase 2-①

/*
========================================
 StudyFlow Phase 2-①
========================================

Phase 1
・今日のタスク
・タスク完了
・達成率
・タスク追加
・タスクごとのタイマー
・実績学習時間
・今日の時間割
・進捗表示
・localStorage保存

Phase 2-①
・勉強開始時刻
・勉強終了時刻
・固定予定
・タスク優先度
・自動時間割生成
・localStorage保存

Supabaseはまだ使用しません。
*/


// ========================================
// localStorage
// ========================================

const STORAGE_KEY = "studyflow_phase2_v1";


// ========================================
// 初期タスク
// ========================================

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


// ========================================
// 初期設定
// ========================================

const INITIAL_SETTINGS = {
  studyStart: "09:00",
  studyEnd: "22:00",

  fixedSchedules: []
};


// ========================================
// データ読み込み
// ========================================

function loadData() {

  try {

    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    if (saved && saved.tasks) {

      return {
        tasks: saved.tasks || INITIAL_TASKS,
        actualMinutes: saved.actualMinutes || 0,
        history: saved.history || [],

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

    tasks: INITIAL_TASKS,

    actualMinutes: 0,

    history: [],

    settings: INITIAL_SETTINGS

  };

}


// ========================================
// データ保存
// ========================================

function saveData(data) {

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data)
  );

}


// ========================================
// 日付
// ========================================

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


// ========================================
// 時刻 → 分
// ========================================

function timeToMinutes(time) {

  const [hours, minutes] =
    time.split(":").map(Number);

  return hours * 60 + minutes;

}


// ========================================
// 分 → 時刻
// ========================================

function formatTime(minutes) {

  const normalized =
    ((minutes % 1440) + 1440) % 1440;

  const hours =
    Math.floor(normalized / 60);

  const mins =
    normalized % 60;

  return (
    String(hours).padStart(2, "0") +
    ":" +
    String(mins).padStart(2, "0")
  );

}


// ========================================
// タイマー表示
// ========================================

function formatTimer(totalSeconds) {

  const minutes =
    Math.floor(totalSeconds / 60);

  const seconds =
    totalSeconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0")
  );

}


// ========================================
// 予定の重なり判定
// ========================================

function overlaps(
  start,
  end,
  schedules
) {

  return schedules.some(
    (schedule) => {

      return (
        start < schedule.end &&
        end > schedule.start
      );

    }
  );

}


// ========================================
// 自動時間割生成
// ========================================

function createAutoSchedule(
  tasks,
  settings
) {

  const studyStart =
    timeToMinutes(
      settings.studyStart
    );

  const studyEnd =
    timeToMinutes(
      settings.studyEnd
    );


  // 開始と終了が逆の場合
  if (studyEnd <= studyStart) {
    return [];
  }


  // 固定予定を時間順に並べる
  const fixedSchedules =
    (settings.fixedSchedules || [])
      .map((schedule) => ({
        ...schedule,
        start:
          timeToMinutes(
            schedule.start
          ),
        end:
          timeToMinutes(
            schedule.end
          ),
        type: "fixed"
      }))
      .filter(
        (schedule) =>
          schedule.end > schedule.start
      )
      .sort(
        (a, b) =>
          a.start - b.start
      );


  // 未完了タスクだけを対象にする
  // 優先度の高い順
  const unscheduledTasks =
    tasks
      .filter(
        (task) => !task.done
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

  let current =
    studyStart;


  // 空いている場所を探す関数
  function findNextAvailable(
    start,
    duration
  ) {

    let candidate = start;

    while (candidate + duration <= studyEnd) {

      const conflicting =
        fixedSchedules.find(
          (schedule) =>
            candidate < schedule.end &&
            candidate + duration >
              schedule.start
        );


      if (!conflicting) {
        return candidate;
      }


      candidate =
        conflicting.end;

    }

    return null;

  }


  for (const task of unscheduledTasks) {

    const duration =
      Number(task.minutes) || 30;


    const start =
      findNextAvailable(
        current,
        duration
      );


    if (start === null) {
      break;
    }


    const end =
      start + duration;


    result.push({
      ...task,
      start,
      end,
      type: "task"
    });


    current = end;

  }


  // 固定予定と勉強予定をまとめて時間順にする
  return [
    ...result,
    ...fixedSchedules
  ].sort(
    (a, b) =>
      a.start - b.start
  );

}


// ========================================
// メイン
// ========================================

function App() {


  // ------------------------------------
  // State
  // ------------------------------------

  const [data, setData] =
    useState(loadData);


  const [tab, setTab] =
    useState("today");


  const [runningId, setRunningId] =
    useState(null);


  const [seconds, setSeconds] =
    useState(0);


  const [newTitle, setNewTitle] =
    useState("");


  const [newMinutes, setNewMinutes] =
    useState(30);


  // 固定予定入力
  const [fixedTitle, setFixedTitle] =
    useState("");


  const [fixedStart, setFixedStart] =
    useState("19:20");


  const [fixedEnd, setFixedEnd] =
    useState("21:30");


  // ------------------------------------
  // データ保存
  // ------------------------------------

  useEffect(() => {

    saveData(data);

  }, [data]);


  // ------------------------------------
  // タイマー
  // ------------------------------------

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

      clearInterval(timer);

    };

  }, [runningId]);


  // ====================================
  // 計算
  // ====================================

  const completedTasks =
    data.tasks.filter(
      (task) => task.done
    ).length;


  const totalTasks =
    data.tasks.length;


  const progress =
    totalTasks === 0
      ? 0
      : Math.round(
          (completedTasks /
            totalTasks) *
            100
        );


  const plannedMinutes =
    data.tasks.reduce(
      (total, task) =>
        total +
        Number(task.minutes),
      0
    );


  const completedTaskMinutes =
    data.tasks
      .filter(
        (task) => task.done
      )
      .reduce(
        (total, task) =>
          total +
          Number(task.minutes),
        0
      );


  const remainingTasks =
    data.tasks.filter(
      (task) => !task.done
    );


  // ====================================
  // 自動時間割
  // ====================================

  const todayPlan = useMemo(() => {

    return createAutoSchedule(
      data.tasks,
      data.settings
    );

  }, [
    data.tasks,
    data.settings
  ]);


  // ====================================
  // タスク完了切り替え
  // ====================================

  function toggleTask(id) {

    setData((current) => ({

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

    }));

  }


  // ====================================
  // タイマー開始 / 停止
  // ====================================

  function startTimer(task) {


    // 同じタスクを押した場合 → 停止
    if (
      runningId === task.id
    ) {

      const earnedMinutes =
        Math.max(
          1,
          Math.round(
            seconds / 60
          )
        );


      setData((current) => ({

        ...current,

        actualMinutes:
          current.actualMinutes +
          earnedMinutes

      }));


      setRunningId(null);

      setSeconds(0);

      return;

    }


    // 別のタイマーが動いている場合
    if (runningId) {

      window.alert(
        "現在別のタスクのタイマーが動いています。先に停止してください。"
      );

      return;

    }


    setRunningId(task.id);

    setSeconds(0);

  }


  // ====================================
  // タスク追加
  // ====================================

  function addTask(event) {

    event.preventDefault();


    if (!newTitle.trim()) {
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
        Number(newMinutes) ||
        30,

      priority:
        2,

      done:
        false

    };


    setData((current) => ({

      ...current,

      tasks: [
        ...current.tasks,
        newTask
      ]

    }));


    setNewTitle("");

  }


  // ====================================
  // 優先度変更
  // ====================================

  function updatePriority(
    taskId,
    priority
  ) {

    setData((current) => ({

      ...current,

      tasks:
        current.tasks.map(
          (task) => {

            if (
              task.id !== taskId
            ) {
              return task;
            }


            return {
              ...task,
              priority:
                Number(priority)
            };

          }
        )

    }));

  }


  // ====================================
  // 勉強時間変更
  // ====================================

  function updateStudyTime(
    field,
    value
  ) {

    setData((current) => ({

      ...current,

      settings: {

        ...current.settings,

        [field]: value

      }

    }));

  }


  // ====================================
  // 固定予定追加
  // ====================================

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


    setData((current) => ({

      ...current,

      settings: {

        ...current.settings,

        fixedSchedules: [
          ...(current.settings
            .fixedSchedules || []),

          newSchedule
        ]

      }

    }));


    setFixedTitle("");

  }


  // ====================================
  // 固定予定削除
  // ====================================

  function deleteFixedSchedule(
    id
  ) {

    setData((current) => ({

      ...current,

      settings: {

        ...current.settings,

        fixedSchedules:
          (
            current.settings
              .fixedSchedules || []
          ).filter(
            (schedule) =>
              schedule.id !== id
          )

      }

    }));

  }


  // ====================================
  // データリセット
  // ====================================

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


    setRunningId(null);

    setSeconds(0);

  }


  // ====================================
  // JSX
  // ====================================

  return (

    <div className="app">


      {/* ==================================
          HEADER
      ================================== */}

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
            Phase 2：予定を入力 → 自動で時間割を作成
          </p>

        </div>

      </header>



      {/* ==================================
          NAVIGATION
      ================================== */}

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


        {/* ==================================
            TODAY
        ================================== */}

        {tab === "today" && (

          <>


            {/* 達成状況 */}

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



            {/* 今日のタスク */}

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
                          onChange={(event) =>
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



            {/* タスク追加 */}

            <section className="card">

              <h2>
                タスクを追加
              </h2>


              <form
                className="addForm"
                onSubmit={addTask}
              >

                <input
                  value={newTitle}
                  onChange={(event) =>
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
                  value={newMinutes}
                  onChange={(event) =>
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



        {/* ==================================
            PLAN
        ================================== */}

        {tab === "plan" && (

          <>


            {/* 勉強時間設定 */}

            <section className="card">

              <div className="row">

                <div>

                  <span className="eyebrow">
                    SETTINGS
                  </span>

                  <h2>
                    勉強できる時間
                  </h2>

                </div>

              </div>


              <p className="muted">

                今日、実際に勉強できる時間を設定してください。
                自動時間割はこの範囲内で作成されます。

              </p>


              <div
                className="addForm"
              >

                <label>

                  開始

                  <input
                    type="time"
                    value={
                      data.settings
                        .studyStart
                    }
                    onChange={(event) =>
                      updateStudyTime(
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
                    onChange={(event) =>
                      updateStudyTime(
                        "studyEnd",
                        event.target.value
                      )
                    }
                  />

                </label>

              </div>

            </section>



            {/* 固定予定 */}

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

              </p>


              <form
                className="addForm"
                onSubmit={
                  addFixedSchedule
                }
              >

                <input
                  value={fixedTitle}
                  onChange={(event) =>
                    setFixedTitle(
                      event.target.value
                    )
                  }
                  placeholder="例：塾"
                />


                <input
                  type="time"
                  value={fixedStart}
                  onChange={(event) =>
                    setFixedStart(
                      event.target.value
                    )
                  }
                />


                <input
                  type="time"
                  value={fixedEnd}
                  onChange={(event) =>
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


              {(data.settings
                .fixedSchedules || []
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
                      (schedule) => (

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

                            {schedule.start}
                            {"–"}
                            {schedule.end}

                          </div>


                          <div
                            style={{
                              flex:
                                1
                            }}
                          >

                            <strong>
                              {schedule.title}
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



            {/* 自動時間割 */}

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
                  優先度順で自動作成
                </span>

              </div>


              <div className="schedule">

                {todayPlan.length ===
                0 ? (

                  <p className="muted">
                    勉強時間内に配置できる
                    未完了タスクがありません。
                  </p>

                ) : (

                  todayPlan.map(
                    (item) => (

                      <div
                        key={
                          item.type ===
                          "fixed"
                            ? `fixed-${item.id}`
                            : `task-${item.id}`
                        }
                        className={
                          item.type ===
                          "fixed"
                            ? "scheduleItem"
                            : item.done
                              ? "scheduleItem done"
                              : "scheduleItem"
                        }
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

                              : `${item.subject} ・ ${item.minutes}分 ・ 優先度${item.priority}`}

                          </small>

                        </div>

                      </div>

                    )
                  )

                )}

              </div>


              <div className="notice">

                <strong>
                  自動時間割の仕組み
                </strong>

                <br />

                ① 勉強できる時間を確認

                <br />

                ② 固定予定を先に確保

                <br />

                ③ 未完了タスクを優先度順に並べる

                <br />

                ④ 固定予定と重ならない場所に配置

              </div>

            </section>

          </>

        )}



        {/* ==================================
            PROGRESS
        ================================== */}

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
                onClick={resetData}
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


// ========================================
// React起動
// ========================================

createRoot(
  document.getElementById("root")
).render(
  <App />
);
