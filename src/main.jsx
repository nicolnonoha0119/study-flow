import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// StudyFlow Phase 1

/*
========================================
 StudyFlow Phase 1
========================================

実装内容

・今日のタスク
・タスク完了
・達成率
・タスク追加
・タスクごとのタイマー
・実績学習時間
・今日の時間割
・進捗表示
・localStorage保存

Phase 1ではSupabaseは使用しません。
*/


// ========================================
// localStorage
// ========================================

const STORAGE_KEY = "studyflow_phase1_v1";


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
// データ読み込み
// ========================================

function loadData() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY)
    );

    if (saved && saved.tasks) {
      return saved;
    }
  } catch (error) {
    console.error("データ読み込みエラー:", error);
  }

  return {
    tasks: INITIAL_TASKS,
    actualMinutes: 0,
    history: []
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
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());
}


// ========================================
// メイン
// ========================================

function App() {

  // ------------------------------------
  // State
  // ------------------------------------

  const [data, setData] = useState(loadData);

  const [tab, setTab] = useState("today");

  const [runningId, setRunningId] = useState(null);

  const [seconds, setSeconds] = useState(0);

  const [newTitle, setNewTitle] = useState("");

  const [newMinutes, setNewMinutes] = useState(30);


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

    const timer = setInterval(() => {

      setSeconds((current) => current + 1);

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
          (completedTasks / totalTasks) * 100
        );


  const plannedMinutes =
    data.tasks.reduce(
      (total, task) =>
        total + Number(task.minutes),
      0
    );


  const completedTaskMinutes =
    data.tasks
      .filter((task) => task.done)
      .reduce(
        (total, task) =>
          total + Number(task.minutes),
        0
      );


  const remainingTasks =
    data.tasks.filter(
      (task) => !task.done
    );


  // ====================================
  // 今日の時間割
  // ====================================

  const todayPlan = useMemo(() => {

    let currentMinutes = 9 * 60;

    return data.tasks.map((task) => {

      const start = currentMinutes;

      currentMinutes += Number(task.minutes);

      const end = currentMinutes;

      return {
        ...task,
        start,
        end
      };

    });

  }, [data.tasks]);


  // ====================================
  // タスク完了切り替え
  // ====================================

  function toggleTask(id) {

    setData((current) => ({

      ...current,

      tasks: current.tasks.map((task) => {

        if (task.id !== id) {
          return task;
        }

        return {
          ...task,
          done: !task.done
        };

      })

    }));

  }


  // ====================================
  // タイマー開始 / 停止
  // ====================================

  function startTimer(task) {

    // 現在動いているタイマーを停止
    if (runningId === task.id) {

      const earnedMinutes =
        Math.max(
          1,
          Math.round(seconds / 60)
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


    // 別のタスクのタイマーが動いていたら
    // いったんリセット
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

      id: crypto.randomUUID(),

      subject: "追加",

      title: newTitle.trim(),

      minutes:
        Number(newMinutes) || 30,

      priority: 2,

      done: false

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
  // データリセット
  // ====================================

  function resetData() {

    const answer = window.confirm(
      "StudyFlow Phase 1の保存データをリセットしますか？"
    );


    if (!answer) {
      return;
    }


    setData({

      tasks: INITIAL_TASKS,

      actualMinutes: 0,

      history: []

    });


    setRunningId(null);

    setSeconds(0);

  }


  // ====================================
  // 時刻表示
  // ====================================

  function formatTime(minutes) {

    const hours =
      Math.floor(minutes / 60) % 24;

    const mins =
      minutes % 60;


    return (
      String(hours).padStart(2, "0") +
      ":" +
      String(mins).padStart(2, "0")
    );

  }


  // ====================================
  // タイマー表示
  // ====================================

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
            Phase 1：タスク → 時間割 → タイマー → 完了 → 進捗
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
          onClick={() => setTab("today")}
        >
          今日
        </button>


        <button
          className={
            tab === "plan"
              ? "navButton active"
              : "navButton"
          }
          onClick={() => setTab("plan")}
        >
          時間割
        </button>


        <button
          className={
            tab === "progress"
              ? "navButton active"
              : "navButton"
          }
          onClick={() => setTab("progress")}
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

            <section className="card heroCard">

              <div className="row">

                <div>

                  <span className="eyebrow">
                    TODAY
                  </span>

                  <h2>
                    今日の達成状況
                  </h2>

                </div>


                <strong className="bigNumber">
                  {progress}%
                </strong>

              </div>


              <div className="progressBar">

                <span
                  style={{
                    width: `${progress}%`
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

                {data.tasks.map((task) => (

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
                      checked={task.done}
                      onChange={() =>
                        toggleTask(task.id)
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


                    <button
                      className="timerButton"
                      onClick={() =>
                        startTimer(task)
                      }
                    >

                      {runningId === task.id

                        ? `停止 ${formatTimer(seconds)}`

                        : "開始"

                      }

                    </button>


                  </div>

                ))}

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

          <section className="card">

            <div className="row">

              <div>

                <span className="eyebrow">
                  PLAN
                </span>

                <h2>
                  今日の時間割
                </h2>

              </div>


              <span className="muted">
                09:00開始の仮プラン
              </span>

            </div>


            <div className="schedule">

              {todayPlan.map((task) => (

                <div
                  key={task.id}
                  className={
                    task.done
                      ? "scheduleItem done"
                      : "scheduleItem"
                  }
                >

                  <div className="scheduleTime">

                    {formatTime(task.start)}
                    {"–"}
                    {formatTime(task.end)}

                  </div>


                  <div>

                    <strong>
                      {task.title}
                    </strong>


                    <small>
                      {task.subject}
                      {" ・ "}
                      {task.minutes}分
                    </small>

                  </div>

                </div>

              ))}

            </div>


            <div className="notice">

              Phase 2では、

              <strong>
                起床時刻・朝の支度70分・自習室への移動40分・空き時間
              </strong>

              などを入力すると、
              この時間割を自動的に組み直せるようにします。

            </div>

          </section>

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
                    width: `${progress}%`
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

                Phase 1では、
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
                Phase 1データをリセット
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
