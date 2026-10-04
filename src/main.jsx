import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

/*
========================================
 StudyFlow
 AI搭載前・統合版
========================================

【認証】
・メールアドレス / パスワード
・新規登録 / ログイン / ログアウト

【データ】
・Supabase保存
・localStorageバックアップ
・初回ログイン時のデータ移行

【学習管理】
・タスク
・優先度
・必要時間
・学習済み時間
・完了状態

【時間管理】
・起床時刻
・朝の支度
・学習可能時間帯
・自習室移動
・固定予定
・空き時間自動計算

【自動計画】
・優先度順
・空き時間への自動配置
・長時間タスクの自動分割
・不足時間表示

【その他】
・タイマー
・カレンダー
・進捗
・設定

========================================
*/

const LOCAL_KEY = "studyflow_all_in_one_v2";

const DEFAULT_TASKS = [
  {
    subject: "数学",
    title: "基礎問題精講 数III 積分",
    minutes: 60,
    priority: 5,
  },
  {
    subject: "英語",
    title: "Vintage 英文法",
    minutes: 45,
    priority: 4,
  },
  {
    subject: "物理",
    title: "セミナー物理",
    minutes: 45,
    priority: 3,
  },
  {
    subject: "化学",
    title: "セミナー化学",
    minutes: 45,
    priority: 3,
  },
  {
    subject: "研究",
    title: "ギター音源・実験データ整理",
    minutes: 30,
    priority: 2,
  },
];

const DEFAULT_SETTINGS = {
  wakeUpTime: "07:00",
  morningPrepMinutes: 70,

  useStudyRoom: false,
  travelMinutes: 40,

  studyStart: "14:00",
  studyEnd: "22:00",

  defaultTaskMinutes: 45,

  breakMinutes: 10,

  minimumStudyBlock: 15,
};

const FIXED_CATEGORIES = {
  school: "学校",
  cram: "塾",
  club: "部活",
  meal: "食事",
  research: "研究",
  other: "その他",
};

/* ========================================
   基本関数
======================================== */

function todayString() {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function formatDateJP(dateString) {
  if (!dateString) return "";

  const [y, m, d] = dateString.split("-");

  return `${y}/${m}/${d}`;
}

function timeToMinutes(time) {
  if (!time) return 0;

  const [h, m] = time.split(":").map(Number);

  return h * 60 + m;
}

function minutesToTime(total) {
  total = Math.max(0, Math.round(total));

  const h = Math.floor(total / 60);
  const m = total % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}`;
}

function addDays(dateString, amount) {
  const d = new Date(`${dateString}T00:00:00`);

  d.setDate(d.getDate() + amount);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function getDaysInMonth(dateString) {
  const [year, month] = dateString.split("-").map(Number);

  return new Date(year, month, 0).getDate();
}

function getMonthStart(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function getRandomId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

/* ========================================
   LocalStorage
======================================== */

function getLocalData() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);

    if (!raw) return null;

    const data = JSON.parse(raw);

    return {
      tasks: Array.isArray(data.tasks) ? data.tasks : [],

      fixedSchedules: Array.isArray(data.fixedSchedules)
        ? data.fixedSchedules
        : [],

      settings: {
        ...DEFAULT_SETTINGS,
        ...(data.settings || {}),
      },
    };
  } catch {
    return null;
  }
}

function saveLocalData(data) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        tasks: data.tasks || [],
        fixedSchedules: data.fixedSchedules || [],
        settings: data.settings || DEFAULT_SETTINGS,
      })
    );
  } catch (error) {
    console.error("localStorage error:", error);
  }
}

/* ========================================
   Normalize
======================================== */

function normalizeTask(task) {
  return {
    id: task.id || getRandomId(),

    subject: task.subject || "その他",

    title: task.title || "無題のタスク",

    minutes: Math.max(
      1,
      Number(task.minutes) || 30
    ),

    priority: Math.min(
      5,
      Math.max(1, Number(task.priority) || 3)
    ),

    taskDate:
      task.taskDate ||
      task.task_date ||
      todayString(),

    completed: Boolean(task.completed),

    studiedMinutes:
      Number(
        task.studiedMinutes ??
          task.studied_minutes
      ) || 0,
  };
}

function normalizeFixedSchedule(schedule) {
  return {
    id: schedule.id || getRandomId(),

    title: schedule.title || "予定",

    category:
      schedule.category || "other",

    startTime:
      schedule.startTime ||
      schedule.start_time ||
      "09:00",

    endTime:
      schedule.endTime ||
      schedule.end_time ||
      "10:00",

    repeatType:
      schedule.repeatType ||
      schedule.repeat_type ||
      "today",

    scheduleDate:
      schedule.scheduleDate ||
      schedule.schedule_date ||
      todayString(),
  };
}

/* ========================================
   Schedule
======================================== */

function scheduleAppliesToDate(schedule, date) {
  if (schedule.repeatType === "daily") {
    return true;
  }

  return schedule.scheduleDate === date;
}

/* ========================================
   時間計算
======================================== */

/*
   勉強できない時間を全部集める
*/
function getBlockedIntervals(
  date,
  settings,
  fixedSchedules
) {
  const intervals = [];

  const wakeUp = timeToMinutes(
    settings.wakeUpTime
  );

  const prep = Number(
    settings.morningPrepMinutes || 0
  );

  const studyStart = timeToMinutes(
    settings.studyStart
  );

  const studyEnd = timeToMinutes(
    settings.studyEnd
  );

  /* 起床前 */
  intervals.push({
    start: 0,
    end: wakeUp,
    reason: "起床前",
  });

  /* 朝の支度 */
  intervals.push({
    start: wakeUp,
    end: wakeUp + prep,
    reason: "朝の支度",
  });

  /*
     学習可能時間帯より前
  */
  intervals.push({
    start: 0,
    end: studyStart,
    reason: "学習時間外",
  });

  /*
     学習可能時間帯より後
  */
  intervals.push({
    start: studyEnd,
    end: 24 * 60,
    reason: "学習時間外",
  });

  /*
     自習室への移動
  */
  if (settings.useStudyRoom) {
    const travel = Number(
      settings.travelMinutes || 0
    );

    if (travel > 0) {
      intervals.push({
        start: Math.max(
          0,
          studyStart - travel
        ),
        end: studyStart,
        reason: "自習室への移動",
      });
    }
  }

  /*
     固定予定
  */
  fixedSchedules
    .filter((schedule) =>
      scheduleAppliesToDate(
        schedule,
        date
      )
    )
    .forEach((schedule) => {
      const start = timeToMinutes(
        schedule.startTime
      );

      const end = timeToMinutes(
        schedule.endTime
      );

      if (end > start) {
        intervals.push({
          start,
          end,
          reason:
            schedule.title ||
            FIXED_CATEGORIES[
              schedule.category
            ] ||
            "固定予定",
        });
      }
    });

  return mergeIntervals(intervals);
}

/*
   重なっている時間をまとめる
*/
function mergeIntervals(intervals) {
  const valid = intervals
    .filter(
      (item) => item.end > item.start
    )
    .sort(
      (a, b) => a.start - b.start
    );

  const result = [];

  for (const current of valid) {
    if (result.length === 0) {
      result.push({
        start: current.start,
        end: current.end,
        reasons: current.reason
          ? [current.reason]
          : [],
      });

      continue;
    }

    const last =
      result[result.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(
        last.end,
        current.end
      );

      if (
        current.reason &&
        !last.reasons.includes(
          current.reason
        )
      ) {
        last.reasons.push(
          current.reason
        );
      }
    } else {
      result.push({
        start: current.start,
        end: current.end,
        reasons: current.reason
          ? [current.reason]
          : [],
      });
    }
  }

  return result;
}

/*
   実際に勉強できる空き時間
*/
function getFreeSlots(
  date,
  settings,
  fixedSchedules
) {
  const studyStart = timeToMinutes(
    settings.studyStart
  );

  const studyEnd = timeToMinutes(
    settings.studyEnd
  );

  if (studyEnd <= studyStart) {
    return [];
  }

  const blocked =
    getBlockedIntervals(
      date,
      settings,
      fixedSchedules
    );

  const relevant = blocked
    .filter(
      (item) =>
        item.end > studyStart &&
        item.start < studyEnd
    )
    .map((item) => ({
      start: Math.max(
        item.start,
        studyStart
      ),
      end: Math.min(
        item.end,
        studyEnd
      ),
    }));

  const merged =
    mergeIntervals(relevant);

  const slots = [];

  let cursor = studyStart;

  for (const block of merged) {
    if (block.start > cursor) {
      slots.push({
        start: cursor,
        end: block.start,
        minutes:
          block.start - cursor,
      });
    }

    cursor = Math.max(
      cursor,
      block.end
    );
  }

  if (cursor < studyEnd) {
    slots.push({
      start: cursor,
      end: studyEnd,
      minutes:
        studyEnd - cursor,
    });
  }

  return slots.filter(
    (slot) =>
      slot.minutes >=
      Number(
        settings.minimumStudyBlock || 1
      )
  );
}

/*
   時間分析
*/
function analyzeDay(
  date,
  settings,
  fixedSchedules
) {
  const studyStart = timeToMinutes(
    settings.studyStart
  );

  const studyEnd = timeToMinutes(
    settings.studyEnd
  );

  const freeSlots = getFreeSlots(
    date,
    settings,
    fixedSchedules
  );

  const blocked =
    getBlockedIntervals(
      date,
      settings,
      fixedSchedules
    );

  const totalWindow = Math.max(
    0,
    studyEnd - studyStart
  );

  const totalAvailable =
    freeSlots.reduce(
      (sum, slot) =>
        sum + slot.minutes,
      0
    );

  const blockedDuringStudy =
    Math.max(
      0,
      totalWindow - totalAvailable
    );

  return {
    studyStart,
    studyEnd,

    totalWindow,

    totalAvailable,

    blockedDuringStudy,

    freeSlots,

    blocked,
  };
}

/* ========================================
   自動学習計画
======================================== */

function generatePlan(
  date,
  tasks,
  settings,
  fixedSchedules
) {
  const analysis = analyzeDay(
    date,
    settings,
    fixedSchedules
  );

  const availableTasks = tasks
    .filter(
      (task) =>
        task.taskDate === date &&
        !task.completed
    )
    .map((task) => ({
      ...task,

      remaining: Math.max(
        0,
        Number(task.minutes) -
          Number(
            task.studiedMinutes || 0
          )
      ),
    }))
    .filter(
      (task) => task.remaining > 0
    )
    .sort((a, b) => {
      /*
         優先度 →
         未完了時間 →
         科目
      */
      if (
        b.priority !==
        a.priority
      ) {
        return (
          b.priority -
          a.priority
        );
      }

      if (
        b.remaining !==
        a.remaining
      ) {
        return (
          b.remaining -
          a.remaining
        );
      }

      return a.subject.localeCompare(
        b.subject,
        "ja"
      );
    });

  const workingTasks =
    availableTasks.map(
      (task) => ({
        ...task,
      })
    );

  const plan = [];

  let taskIndex = 0;

  for (const slot of analysis.freeSlots) {
    let cursor = slot.start;

    while (
      cursor < slot.end &&
      taskIndex <
        workingTasks.length
    ) {
      const task =
        workingTasks[taskIndex];

      const remainingSlot =
        slot.end - cursor;

      const amount = Math.min(
        task.remaining,
        remainingSlot
      );

      if (amount <= 0) {
        taskIndex++;
        continue;
      }

      plan.push({
        id: `${task.id}-${plan.length}`,

        taskId: task.id,

        subject: task.subject,

        title: task.title,

        priority: task.priority,

        start:
          minutesToTime(cursor),

        end: minutesToTime(
          cursor + amount
        ),

        minutes: amount,
      });

      cursor += amount;

      task.remaining -= amount;

      if (task.remaining <= 0) {
        taskIndex++;
      }
    }
  }

  const totalRequired =
    availableTasks.reduce(
      (sum, task) =>
        sum + task.remaining,
      0
    );

  const totalPlanned =
    plan.reduce(
      (sum, item) =>
        sum + item.minutes,
      0
    );

  return {
    plan,

    totalAvailable:
      analysis.totalAvailable,

    totalRequired,

    totalPlanned,

    shortage: Math.max(
      0,
      totalRequired -
        totalPlanned
    ),

    freeSlots:
      analysis.freeSlots,

    blocked:
      analysis.blocked,

    totalWindow:
      analysis.totalWindow,

    blockedDuringStudy:
      analysis.blockedDuringStudy,
  };
}

/* ========================================
   Supabase conversion
======================================== */

function supabaseTaskToLocal(task) {
  return normalizeTask({
    id: task.id,
    subject: task.subject,
    title: task.title,
    minutes: task.minutes,
    priority: task.priority,
    taskDate: task.task_date,
    completed: task.completed,
    studiedMinutes:
      task.studied_minutes,
  });
}

function localTaskToSupabase(
  task,
  userId
) {
  return {
    id: task.id,
    user_id: userId,

    subject: task.subject,

    title: task.title,

    minutes:
      Number(task.minutes) || 30,

    priority:
      Number(task.priority) || 3,

    task_date: task.taskDate,

    completed:
      Boolean(task.completed),

    studied_minutes:
      Number(
        task.studiedMinutes
      ) || 0,
  };
}

function supabaseScheduleToLocal(
  schedule
) {
  return normalizeFixedSchedule({
    id: schedule.id,
    title: schedule.title,
    category: schedule.category,
    startTime:
      schedule.start_time,
    endTime:
      schedule.end_time,
    repeatType:
      schedule.repeat_type,
    scheduleDate:
      schedule.schedule_date,
  });
}

function localScheduleToSupabase(
  schedule,
  userId
) {
  return {
    id: schedule.id,

    user_id: userId,

    title: schedule.title,

    category:
      schedule.category,

    start_time:
      schedule.startTime,

    end_time:
      schedule.endTime,

    repeat_type:
      schedule.repeatType,

    schedule_date:
      schedule.repeatType ===
      "daily"
        ? null
        : schedule.scheduleDate,
  };
}

/* ========================================
   Auth
======================================== */

function AuthScreen({
  onAuthenticated,
}) {
  const [mode, setMode] =
    useState("login");

  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [nickname, setNickname] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [message, setMessage] =
    useState("");

  const [error, setError] =
    useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);

    setError("");
    setMessage("");

    try {
      if (!email || !password) {
        throw new Error(
          "メールアドレスとパスワードを入力してください。"
        );
      }

      if (password.length < 6) {
        throw new Error(
          "パスワードは6文字以上にしてください。"
        );
      }

      if (mode === "signup") {
        const {
          data,
          error: signUpError,
        } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (signUpError) {
          throw signUpError;
        }

        if (data.user) {
          const {
            error: profileError,
          } = await supabase
            .from("profiles")
            .upsert({
              id: data.user.id,

              nickname:
                nickname ||
                "StudyFlow User",
            });

          if (profileError) {
            console.warn(
              "プロフィール保存エラー:",
              profileError
            );
          }
        }

        if (!data.session) {
          setMessage(
            "登録しました。メール確認が必要な場合は、届いたメールを確認してください。"
          );
        } else {
          onAuthenticated(
            data.session.user
          );
        }
      } else {
        const {
          data,
          error: loginError,
        } =
          await supabase.auth.signInWithPassword(
            {
              email,
              password,
            }
          );

        if (loginError) {
          throw loginError;
        }

        onAuthenticated(data.user);
      }
    } catch (err) {
      setError(
        err.message ||
          "認証に失敗しました。"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-container">
      <div className="auth-card">
        <div
          style={{
            textAlign: "center",
            marginBottom: 28,
          }}
        >
          <div
            style={{
              fontSize: 42,
              marginBottom: 8,
            }}
          >
            ◇
          </div>

          <h1>StudyFlow</h1>

          <p>
            あなたの勉強時間を、
            <br />
            もっと効率的に。
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <label>
              ニックネーム
              <input
                value={nickname}
                onChange={(e) =>
                  setNickname(
                    e.target.value
                  )
                }
                placeholder="ニックネーム"
              />
            </label>
          )}

          <label>
            メールアドレス
            <input
              type="email"
              value={email}
              onChange={(e) =>
                setEmail(e.target.value)
              }
              placeholder="example@email.com"
            />
          </label>

          <label>
            パスワード
            <input
              type="password"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              placeholder="6文字以上"
            />
          </label>

          {error && (
            <p className="error">
              {error}
            </p>
          )}

          {message && (
            <p className="success">
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
          >
            {loading
              ? "処理中..."
              : mode === "login"
              ? "ログイン"
              : "アカウントを作成"}
          </button>
        </form>

        <button
          className="secondary-button"
          style={{
            width: "100%",
            marginTop: 12,
          }}
          onClick={() => {
            setMode(
              mode === "login"
                ? "signup"
                : "login"
            );

            setError("");
            setMessage("");
          }}
        >
          {mode === "login"
            ? "新規登録はこちら"
            : "ログインはこちら"}
        </button>
      </div>
    </main>
  );
}

/* ========================================
   App
======================================== */

function App() {
  const [user, setUser] =
    useState(null);

  const [authLoading, setAuthLoading] =
    useState(true);

  const [activeTab, setActiveTab] =
    useState("today");

  const [selectedDate, setSelectedDate] =
    useState(todayString());

  const [tasks, setTasks] =
    useState([]);

  const [
    fixedSchedules,
    setFixedSchedules,
  ] = useState([]);

  const [settings, setSettings] =
    useState(DEFAULT_SETTINGS);

  const [settingsDraft, setSettingsDraft] =
    useState(DEFAULT_SETTINGS);

  const [loadingData, setLoadingData] =
    useState(false);

  const [syncMessage, setSyncMessage] =
    useState("");

  /* タスク追加 */
  const [newTask, setNewTask] =
    useState({
      subject: "数学",
      title: "",
      minutes: 45,
      priority: 3,
    });

  /* 固定予定 */
  const [newSchedule, setNewSchedule] =
    useState({
      title: "",
      category: "school",
      startTime: "09:00",
      endTime: "10:00",
      repeatType: "today",
    });

  /* タイマー */
  const [timerTaskId, setTimerTaskId] =
    useState("");

  const [timerSeconds, setTimerSeconds] =
    useState(0);

  const [timerRunning, setTimerRunning] =
    useState(false);

  /* カレンダー */
  const [calendarMonth, setCalendarMonth] =
    useState(todayString());

  /* ========================================
     Auth
  ======================================== */

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } =
        await supabase.auth.getSession();

      if (mounted) {
        setUser(
          session?.user || null
        );

        setAuthLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } =
      supabase.auth.onAuthStateChange(
        (_event, session) => {
          setUser(
            session?.user || null
          );
        }
      );

    return () => {
      mounted = false;

      subscription.unsubscribe();
    };
  }, []);

  /* ========================================
     Supabase読み込み
  ======================================== */

  async function loadSupabaseData(
    currentUser
  ) {
    if (!currentUser) return;

    setLoadingData(true);
    setSyncMessage("");

    try {
      const [
        tasksResult,
        schedulesResult,
        settingsResult,
      ] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq(
            "user_id",
            currentUser.id
          )
          .order(
            "task_date",
            {
              ascending: true,
            }
          ),

        supabase
          .from("fixed_schedules")
          .select("*")
          .eq(
            "user_id",
            currentUser.id
          )
          .order(
            "start_time",
            {
              ascending: true,
            }
          ),

        supabase
          .from("study_settings")
          .select("*")
          .eq(
            "user_id",
            currentUser.id
          )
          .maybeSingle(),
      ]);

      if (tasksResult.error) {
        throw tasksResult.error;
      }

      if (schedulesResult.error) {
        throw schedulesResult.error;
      }

      if (settingsResult.error) {
        throw settingsResult.error;
      }

      const remoteTasks =
        tasksResult.data?.map(
          supabaseTaskToLocal
        ) || [];

      const remoteSchedules =
        schedulesResult.data?.map(
          supabaseScheduleToLocal
        ) || [];

      const remoteSettings =
        settingsResult.data
          ? {
              wakeUpTime:
                settingsResult.data
                  .wake_up_time
                  ?.slice(0, 5) ||
                DEFAULT_SETTINGS.wakeUpTime,

              morningPrepMinutes:
                settingsResult.data
                  .morning_prep_minutes ??
                DEFAULT_SETTINGS.morningPrepMinutes,

              useStudyRoom:
                settingsResult.data
                  .use_study_room ??
                DEFAULT_SETTINGS.useStudyRoom,

              travelMinutes:
                settingsResult.data
                  .travel_minutes ??
                DEFAULT_SETTINGS.travelMinutes,

              studyStart:
                settingsResult.data
                  .study_start
                  ?.slice(0, 5) ||
                DEFAULT_SETTINGS.studyStart,

              studyEnd:
                settingsResult.data
                  .study_end
                  ?.slice(0, 5) ||
                DEFAULT_SETTINGS.studyEnd,

              defaultTaskMinutes:
                settingsResult.data
                  .default_task_minutes ??
                DEFAULT_SETTINGS.defaultTaskMinutes,

              breakMinutes:
                DEFAULT_SETTINGS.breakMinutes,

              minimumStudyBlock:
                DEFAULT_SETTINGS.minimumStudyBlock,
            }
          : null;

      const localData =
        getLocalData();

      /*
         初回のみlocalStorageから移行
      */
      if (
        remoteTasks.length === 0 &&
        remoteSchedules.length === 0 &&
        !remoteSettings &&
        localData
      ) {
        const localTasks =
          localData.tasks.map(
            normalizeTask
          );

        const localSchedules =
          localData.fixedSchedules.map(
            normalizeFixedSchedule
          );

        if (localTasks.length) {
          const { error } =
            await supabase
              .from("tasks")
              .upsert(
                localTasks.map(
                  (task) =>
                    localTaskToSupabase(
                      task,
                      currentUser.id
                    )
                )
              );

          if (error) {
            throw error;
          }
        }

        if (localSchedules.length) {
          const { error } =
            await supabase
              .from("fixed_schedules")
              .upsert(
                localSchedules.map(
                  (schedule) =>
                    localScheduleToSupabase(
                      schedule,
                      currentUser.id
                    )
                )
              );

          if (error) {
            throw error;
          }
        }

        const localSettings = {
          ...DEFAULT_SETTINGS,
          ...localData.settings,
        };

        const {
          error: settingsError,
        } = await supabase
          .from("study_settings")
          .upsert({
            user_id:
              currentUser.id,

            wake_up_time:
              localSettings.wakeUpTime,

            morning_prep_minutes:
              Number(
                localSettings.morningPrepMinutes
              ),

            use_study_room:
              Boolean(
                localSettings.useStudyRoom
              ),

            travel_minutes:
              Number(
                localSettings.travelMinutes
              ),

            study_start:
              localSettings.studyStart,

            study_end:
              localSettings.studyEnd,

            default_task_minutes:
              Number(
                localSettings.defaultTaskMinutes
              ),

            updated_at:
              new Date().toISOString(),
          });

        if (settingsError) {
          throw settingsError;
        }

        setTasks(localTasks);

        setFixedSchedules(
          localSchedules
        );

        setSettings(
          localSettings
        );

        setSettingsDraft(
          localSettings
        );

        saveLocalData({
          tasks: localTasks,
          fixedSchedules:
            localSchedules,
          settings:
            localSettings,
        });

        setSyncMessage(
          "これまでのデータをSupabaseへ移行しました。"
        );
      } else {
        const finalSettings =
          remoteSettings ||
          DEFAULT_SETTINGS;

        setTasks(remoteTasks);

        setFixedSchedules(
          remoteSchedules
        );

        setSettings(
          finalSettings
        );

        setSettingsDraft(
          finalSettings
        );

        saveLocalData({
          tasks: remoteTasks,
          fixedSchedules:
            remoteSchedules,
          settings:
            finalSettings,
        });
      }
    } catch (error) {
      console.error(error);

      setSyncMessage(
        `Supabaseの読み込みに失敗しました: ${
          error.message ||
          "Unknown error"
        }`
      );
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (user) {
      loadSupabaseData(user);
    }
  }, [user]);

  /* ========================================
     Local backup
  ======================================== */

  useEffect(() => {
    if (!user) return;

    saveLocalData({
      tasks,
      fixedSchedules,
      settings,
    });
  }, [
    tasks,
    fixedSchedules,
    settings,
    user,
  ]);

  /* ========================================
     Task
  ======================================== */

  async function addTask() {
    if (!newTask.title.trim()) {
      alert(
        "タスク名を入力してください。"
      );

      return;
    }

    const task = normalizeTask({
      ...newTask,

      taskDate: selectedDate,

      completed: false,

      studiedMinutes: 0,
    });

    setTasks((prev) => [
      ...prev,
      task,
    ]);

    const { error } =
      await supabase
        .from("tasks")
        .insert(
          localTaskToSupabase(
            task,
            user.id
          )
        );

    if (error) {
      console.error(error);

      alert(
        `保存に失敗しました: ${error.message}`
      );

      setTasks((prev) =>
        prev.filter(
          (item) =>
            item.id !== task.id
        )
      );

      return;
    }

    setNewTask({
      subject: "数学",
      title: "",
      minutes:
        Number(
          settings.defaultTaskMinutes
        ) || 45,
      priority: 3,
    });
  }

  async function toggleTask(task) {
    const updated = {
      ...task,

      completed:
        !task.completed,
    };

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id
          ? updated
          : item
      )
    );

    const { error } =
      await supabase
        .from("tasks")
        .update({
          completed:
            updated.completed,
        })
        .eq("id", task.id)
        .eq(
          "user_id",
          user.id
        );

    if (error) {
      console.error(error);
    }
  }

  async function deleteTask(
    taskId
  ) {
    const previous = tasks;

    setTasks((prev) =>
      prev.filter(
        (task) =>
          task.id !== taskId
      )
    );

    const { error } =
      await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq(
          "user_id",
          user.id
        );

    if (error) {
      console.error(error);

      setTasks(previous);

      alert(
        `削除に失敗しました: ${error.message}`
      );
    }
  }

  /* ========================================
     Fixed Schedule
  ======================================== */

  async function addSchedule() {
    if (!newSchedule.title.trim()) {
      alert(
        "予定名を入力してください。"
      );

      return;
    }

    if (
      timeToMinutes(
        newSchedule.endTime
      ) <=
      timeToMinutes(
        newSchedule.startTime
      )
    ) {
      alert(
        "終了時刻は開始時刻より後にしてください。"
      );

      return;
    }

    const schedule =
      normalizeFixedSchedule({
        ...newSchedule,

        scheduleDate:
          selectedDate,
      });

    setFixedSchedules((prev) => [
      ...prev,
      schedule,
    ]);

    const { error } =
      await supabase
        .from("fixed_schedules")
        .insert(
          localScheduleToSupabase(
            schedule,
            user.id
          )
        );

    if (error) {
      console.error(error);

      alert(
        `保存に失敗しました: ${error.message}`
      );

      setFixedSchedules((prev) =>
        prev.filter(
          (item) =>
            item.id !==
            schedule.id
        )
      );

      return;
    }

    setNewSchedule({
      title: "",
      category: "school",
      startTime: "09:00",
      endTime: "10:00",
      repeatType: "today",
    });
  }

  async function deleteSchedule(
    scheduleId
  ) {
    const previous =
      fixedSchedules;

    setFixedSchedules((prev) =>
      prev.filter(
        (item) =>
          item.id !==
          scheduleId
      )
    );

    const { error } =
      await supabase
        .from("fixed_schedules")
        .delete()
        .eq(
          "id",
          scheduleId
        )
        .eq(
          "user_id",
          user.id
        );

    if (error) {
      console.error(error);

      setFixedSchedules(
        previous
      );

      alert(
        `削除に失敗しました: ${error.message}`
      );
    }
  }

  /* ========================================
     Settings
  ======================================== */

  async function saveSettings() {
    const next = {
      ...DEFAULT_SETTINGS,
      ...settingsDraft,
    };

    if (
      timeToMinutes(
        next.studyEnd
      ) <=
      timeToMinutes(
        next.studyStart
      )
    ) {
      alert(
        "学習終了時刻は学習開始時刻より後にしてください。"
      );

      return;
    }

    if (
      Number(
        next.morningPrepMinutes
      ) < 0
    ) {
      alert(
        "朝の支度時間を確認してください。"
      );

      return;
    }

    setSettings(next);

    const { error } =
      await supabase
        .from("study_settings")
        .upsert({
          user_id: user.id,

          wake_up_time:
            next.wakeUpTime,

          morning_prep_minutes:
            Number(
              next.morningPrepMinutes
            ),

          use_study_room:
            Boolean(
              next.useStudyRoom
            ),

          travel_minutes:
            Number(
              next.travelMinutes
            ),

          study_start:
            next.studyStart,

          study_end:
            next.studyEnd,

          default_task_minutes:
            Number(
              next.defaultTaskMinutes
            ),

          updated_at:
            new Date().toISOString(),
        });

    if (error) {
      console.error(error);

      alert(
        `設定の保存に失敗しました: ${error.message}`
      );

      return;
    }

    setSyncMessage(
      "設定を保存しました。"
    );
  }

  /* ========================================
     Timer
  ======================================== */

  useEffect(() => {
    if (!timerRunning) {
      return;
    }

    const interval =
      setInterval(() => {
        setTimerSeconds(
          (previous) =>
            previous + 1
        );
      }, 1000);

    return () =>
      clearInterval(interval);
  }, [timerRunning]);

  async function finishTimer() {
    if (!timerTaskId) {
      alert(
        "タスクを選択してください。"
      );

      return;
    }

    if (timerSeconds <= 0) {
      alert(
        "タイマーを開始してください。"
      );

      return;
    }

    const studiedMinutes =
      Math.max(
        1,
        Math.floor(
          timerSeconds / 60
        )
      );

    const target =
      tasks.find(
        (task) =>
          task.id ===
          timerTaskId
      );

    if (!target) {
      return;
    }

    const updated = {
      ...target,

      studiedMinutes:
        Number(
          target.studiedMinutes ||
            0
        ) + studiedMinutes,
    };

    setTasks((prev) =>
      prev.map((task) =>
        task.id === target.id
          ? updated
          : task
      )
    );

    const { error } =
      await supabase
        .from("tasks")
        .update({
          studied_minutes:
            updated.studiedMinutes,
        })
        .eq(
          "id",
          target.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (error) {
      console.error(error);

      alert(
        `学習記録の保存に失敗しました: ${error.message}`
      );

      return;
    }

    setTimerSeconds(0);

    setTimerRunning(false);

    setSyncMessage(
      `${studiedMinutes}分の学習を記録しました。`
    );
  }

  function resetTimer() {
    setTimerRunning(false);
    setTimerSeconds(0);
  }

  /* ========================================
     Derived data
  ======================================== */

  const timeAnalysis =
    useMemo(
      () =>
        analyzeDay(
          selectedDate,
          settings,
          fixedSchedules
        ),
      [
        selectedDate,
        settings,
        fixedSchedules,
      ]
    );

  const planData =
    useMemo(
      () =>
        generatePlan(
          selectedDate,
          tasks,
          settings,
          fixedSchedules
        ),
      [
        selectedDate,
        tasks,
        settings,
        fixedSchedules,
      ]
    );

  const selectedDateTasks =
    useMemo(
      () =>
        tasks.filter(
          (task) =>
            task.taskDate ===
            selectedDate
        ),
      [tasks, selectedDate]
    );

  const selectedDateSchedules =
    useMemo(
      () =>
        fixedSchedules
          .filter((schedule) =>
            scheduleAppliesToDate(
              schedule,
              selectedDate
            )
          )
          .sort(
            (a, b) =>
              timeToMinutes(
                a.startTime
              ) -
              timeToMinutes(
                b.startTime
              )
          ),
      [
        fixedSchedules,
        selectedDate,
      ]
    );

  const totalTaskMinutes =
    tasks.reduce(
      (sum, task) =>
        sum +
        Number(
          task.minutes || 0
        ),
      0
    );

  const totalStudiedMinutes =
    tasks.reduce(
      (sum, task) =>
        sum +
        Number(
          task.studiedMinutes ||
            0
        ),
      0
    );

  const completedTasks =
    tasks.filter(
      (task) =>
        task.completed
    ).length;

  const studyDays =
    new Set(
      tasks
        .filter(
          (task) =>
            Number(
              task.studiedMinutes ||
                0
            ) > 0
        )
        .map(
          (task) =>
            task.taskDate
        )
    );

  const completionRate =
    totalTaskMinutes > 0
      ? Math.min(
          100,
          Math.round(
            (totalStudiedMinutes /
              totalTaskMinutes) *
              100
          )
        )
      : 0;

  /* ========================================
     Calendar
  ======================================== */

  const calendarDays =
    useMemo(() => {
      const first =
        getMonthStart(
          calendarMonth
        );

      const [year, month] =
        first
          .split("-")
          .map(Number);

      const firstDay =
        new Date(
          year,
          month - 1,
          1
        ).getDay();

      const days =
        getDaysInMonth(first);

      const result = [];

      for (
        let i = 0;
        i < firstDay;
        i++
      ) {
        result.push(null);
      }

      for (
        let i = 1;
        i <= days;
        i++
      ) {
        result.push(
          `${year}-${String(
            month
          ).padStart(
            2,
            "0"
          )}-${String(i).padStart(
            2,
            "0"
          )}`
        );
      }

      return result;
    }, [calendarMonth]);

  /* ========================================
     Logout
  ======================================== */

  async function logout() {
    await supabase.auth.signOut();

    setTasks([]);

    setFixedSchedules([]);

    setSettings(
      DEFAULT_SETTINGS
    );

    setSettingsDraft(
      DEFAULT_SETTINGS
    );

    setUser(null);
  }

  /* ========================================
     Loading
  ======================================== */

  if (authLoading) {
    return (
      <main className="container">
        <div className="card">
          <h2>StudyFlow</h2>

          <p>
            読み込み中...
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(
          currentUser
        ) =>
          setUser(currentUser)
        }
      />
    );
  }

  /* ========================================
     Main
  ======================================== */

  return (
    <div>
      <header className="header">
        <div>
          <h1>StudyFlow</h1>

          <p>
            あなたの勉強時間を自動で整理
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span
            style={{
              fontSize: 12,
              color: "#64748b",
            }}
          >
            {user.email}
          </span>

          <button
            className="secondary-button"
            onClick={logout}
          >
            ログアウト
          </button>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={
            activeTab === "today"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("today")
          }
        >
          今日
        </button>

        <button
          className={
            activeTab === "plan"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab("plan")
          }
        >
          自動計画
        </button>

        <button
          className={
            activeTab ===
            "calendar"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "calendar"
            )
          }
        >
          カレンダー
        </button>

        <button
          className={
            activeTab ===
            "progress"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "progress"
            )
          }
        >
          進捗
        </button>

        <button
          className={
            activeTab ===
            "settings"
              ? "active"
              : ""
          }
          onClick={() =>
            setActiveTab(
              "settings"
            )
          }
        >
          設定
        </button>
      </nav>

      <main className="container">
        {loadingData && (
          <div className="notice">
            Supabaseからデータを読み込んでいます...
          </div>
        )}

        {syncMessage && (
          <div className="notice">
            {syncMessage}
          </div>
        )}

        {/* 日付 */}
        <section className="card">
          <strong>
            対象日
          </strong>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems:
                "center",
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() =>
                setSelectedDate(
                  addDays(
                    selectedDate,
                    -1
                  )
                )
              }
            >
              ←
            </button>

            <input
              type="date"
              value={
                selectedDate
              }
              onChange={(e) =>
                setSelectedDate(
                  e.target.value
                )
              }
            />

            <button
              onClick={() =>
                setSelectedDate(
                  addDays(
                    selectedDate,
                    1
                  )
                )
              }
            >
              →
            </button>

            <button
              className="secondary-button"
              onClick={() =>
                setSelectedDate(
                  todayString()
                )
              }
            >
              今日
            </button>

            <strong
              style={{
                marginLeft: 8,
              }}
            >
              {formatDateJP(
                selectedDate
              )}
            </strong>
          </div>
        </section>

        {/* =================================
            TODAY
        ================================= */}

        {activeTab ===
          "today" && (
          <>
            {/* 時間分析 */}
            <section className="grid">
              <div className="card">
                <h2>
                  今日の時間分析
                </h2>

                <p
                  style={{
                    color:
                      "#64748b",
                  }}
                >
                  固定予定・移動・設定時間を考慮して、自動計算しています。
                </p>

                <div className="grid">
                  <div className="stat-card">
                    <div className="label">
                      学習可能時間
                    </div>

                    <div className="value">
                      {
                        timeAnalysis.totalAvailable
                      }
                      <span
                        style={{
                          fontSize: 14,
                          marginLeft: 4,
                        }}
                      >
                        分
                      </span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="label">
                      固定予定等
                    </div>

                    <div className="value">
                      {
                        timeAnalysis.blockedDuringStudy
                      }
                      <span
                        style={{
                          fontSize: 14,
                          marginLeft: 4,
                        }}
                      >
                        分
                      </span>
                    </div>
                  </div>
                </div>

                <h3
                  style={{
                    marginTop: 24,
                  }}
                >
                  勉強できる時間帯
                </h3>

                {timeAnalysis
                  .freeSlots
                  .length ===
                0 ? (
                  <p>
                    現在、学習可能な時間帯がありません。
                  </p>
                ) : (
                  <div className="task-list">
                    {timeAnalysis.freeSlots.map(
                      (
                        slot,
                        index
                      ) => (
                        <div
                          className="task-item"
                          key={index}
                        >
                          <div>
                            <h3>
                              {minutesToTime(
                                slot.start
                              )}
                              〜
                              {minutesToTime(
                                slot.end
                              )}
                            </h3>

                            <p>
                              {slot.minutes}
                              分
                            </p>
                          </div>

                          <strong>
                            空き時間
                          </strong>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>

              {/* 自動計画概要 */}
              <div className="card">
                <h2>
                  今日の学習量
                </h2>

                <div className="grid">
                  <div className="stat-card">
                    <div className="label">
                      必要
                    </div>

                    <div className="value">
                      {
                        planData.totalRequired
                      }
                      <span
                        style={{
                          fontSize: 14,
                          marginLeft: 4,
                        }}
                      >
                        分
                      </span>
                    </div>
                  </div>

                  <div className="stat-card">
                    <div className="label">
                      配置可能
                    </div>

                    <div className="value">
                      {
                        planData.totalPlanned
                      }
                      <span
                        style={{
                          fontSize: 14,
                          marginLeft: 4,
                        }}
                      >
                        分
                      </span>
                    </div>
                  </div>
                </div>

                {planData.shortage >
                0 ? (
                  <div className="error">
                    あと{" "}
                    {
                      planData.shortage
                    }
                    分の学習時間が不足しています。
                  </div>
                ) : (
                  <div className="success">
                    今日のタスクをすべて配置できます。
                  </div>
                )}

                <button
                  className="primary"
                  style={{
                    marginTop: 16,
                    width: "100%",
                  }}
                  onClick={() =>
                    setActiveTab(
                      "plan"
                    )
                  }
                >
                  自動計画を見る
                </button>
              </div>
            </section>

            {/* 固定予定 */}
            <section className="card">
              <h2>
                固定予定
              </h2>

              {selectedDateSchedules.length ===
              0 ? (
                <p>
                  固定予定はありません。
                </p>
              ) : (
                <div className="task-list">
                  {selectedDateSchedules.map(
                    (schedule) => (
                      <div
                        className="task-item"
                        key={
                          schedule.id
                        }
                      >
                        <div>
                          <h3>
                            {
                              schedule.startTime
                            }
                            〜
                            {
                              schedule.endTime
                            }
                          </h3>

                          <p>
                            {
                              schedule.title
                            }{" "}
                            ・{" "}
                            {
                              FIXED_CATEGORIES[
                                schedule.category
                              ] ||
                              "その他"
                            }
                          </p>
                        </div>

                        <button
                          className="danger"
                          onClick={() =>
                            deleteSchedule(
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

              <hr
                style={{
                  margin:
                    "24px 0",
                  border: 0,
                  borderTop:
                    "1px solid #e7eaf0",
                }}
              />

              <div className="form-grid">
                <label>
                  予定名

                  <input
                    value={
                      newSchedule.title
                    }
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        title:
                          e.target
                            .value,
                      })
                    }
                    placeholder="例：学校"
                  />
                </label>

                <label>
                  種類

                  <select
                    value={
                      newSchedule.category
                    }
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        category:
                          e.target
                            .value,
                      })
                    }
                  >
                    {Object.entries(
                      FIXED_CATEGORIES
                    ).map(
                      ([
                        key,
                        value,
                      ]) => (
                        <option
                          key={key}
                          value={key}
                        >
                          {value}
                        </option>
                      )
                    )}
                  </select>
                </label>

                <label>
                  開始

                  <input
                    type="time"
                    value={
                      newSchedule.startTime
                    }
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        startTime:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  終了

                  <input
                    type="time"
                    value={
                      newSchedule.endTime
                    }
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        endTime:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  繰り返し

                  <select
                    value={
                      newSchedule.repeatType
                    }
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        repeatType:
                          e.target
                            .value,
                      })
                    }
                  >
                    <option value="today">
                      この日だけ
                    </option>

                    <option value="daily">
                      毎日
                    </option>
                  </select>
                </label>
              </div>

              <button
                className="primary"
                onClick={
                  addSchedule
                }
              >
                予定を追加
              </button>
            </section>

            {/* タスク追加 */}
            <section className="card">
              <h2>
                タスク追加
              </h2>

              <div className="form-grid">
                <label>
                  科目

                  <input
                    value={
                      newTask.subject
                    }
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        subject:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  タスク

                  <input
                    value={
                      newTask.title
                    }
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        title:
                          e.target
                            .value,
                      })
                    }
                    placeholder="例：数III 積分"
                  />
                </label>

                <label>
                  必要時間

                  <input
                    type="number"
                    min="1"
                    value={
                      newTask.minutes
                    }
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        minutes:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />
                </label>

                <label>
                  優先度

                  <select
                    value={
                      newTask.priority
                    }
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  >
                    <option value="1">
                      1
                    </option>

                    <option value="2">
                      2
                    </option>

                    <option value="3">
                      3
                    </option>

                    <option value="4">
                      4
                    </option>

                    <option value="5">
                      5
                    </option>
                  </select>
                </label>
              </div>

              <button
                className="primary"
                onClick={
                  addTask
                }
              >
                タスクを追加
              </button>
            </section>

            {/* タスク一覧 */}
            <section className="card">
              <h2>
                {formatDateJP(
                  selectedDate
                )} のタスク
              </h2>

              {selectedDateTasks.length ===
              0 ? (
                <p>
                  タスクはありません。
                </p>
              ) : (
                <div className="task-list">
                  {selectedDateTasks.map(
                    (task) => (
                      <div
                        className={`task-item ${
                          task.completed
                            ? "completed"
                            : ""
                        }`}
                        key={
                          task.id
                        }
                      >
                        <div>
                          <h3>
                            {task.subject}
                            {"："}
                            {task.title}
                          </h3>

                          <p>
                            {task.studiedMinutes ||
                              0}
                            {" / "}
                            {
                              task.minutes
                            }
                            分 ・ 優先度{" "}
                            {
                              task.priority
                            }
                          </p>
                        </div>

                        <div
                          style={{
                            display:
                              "flex",
                            gap: 8,
                            flexWrap:
                              "wrap",
                          }}
                        >
                          <button
                            className="secondary"
                            onClick={() =>
                              toggleTask(
                                task
                              )
                            }
                          >
                            {task.completed
                              ? "完了済み"
                              : "完了"}
                          </button>

                          <button
                            className="danger"
                            onClick={() =>
                              deleteTask(
                                task.id
                              )
                            }
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </section>

            {/* タイマー */}
            <section className="card">
              <h2>
                学習タイマー
              </h2>

              <select
                value={
                  timerTaskId
                }
                onChange={(e) =>
                  setTimerTaskId(
                    e.target
                      .value
                  )
                }
              >
                <option value="">
                  タスクを選択
                </option>

                {selectedDateTasks.map(
                  (task) => (
                    <option
                      key={
                        task.id
                      }
                      value={
                        task.id
                      }
                    >
                      {task.subject}
                      ：
                      {task.title}
                    </option>
                  )
                )}
              </select>

              <div className="timer">
                {String(
                  Math.floor(
                    timerSeconds /
                      60
                  )
                ).padStart(
                  2,
                  "0"
                )}
                :
                {String(
                  timerSeconds %
                    60
                ).padStart(
                  2,
                  "0"
                )}
              </div>

              <div
                style={{
                  display:
                    "flex",
                  justifyContent:
                    "center",
                  gap: 10,
                  flexWrap:
                    "wrap",
                }}
              >
                <button
                  className="primary"
                  disabled={
                    !timerTaskId
                  }
                  onClick={() =>
                    setTimerRunning(
                      (prev) =>
                        !prev
                    )
                  }
                >
                  {timerRunning
                    ? "一時停止"
                    : "開始"}
                </button>

                <button
                  className="secondary"
                  disabled={
                    !timerTaskId
                  }
                  onClick={
                    finishTimer
                  }
                >
                  学習終了
                </button>

                <button
                  className="secondary"
                  onClick={
                    resetTimer
                  }
                >
                  リセット
                </button>
              </div>
            </section>
          </>
        )}

        {/* =================================
            PLAN
        ================================= */}

        {activeTab ===
          "plan" && (
          <>
            <section className="grid">
              <div className="stat-card">
                <div className="label">
                  勉強可能時間
                </div>

                <div className="value">
                  {
                    planData.totalAvailable
                  }
                  分
                </div>
              </div>

              <div className="stat-card">
                <div className="label">
                  必要時間
                </div>

                <div className="value">
                  {
                    planData.totalRequired
                  }
                  分
                </div>
              </div>

              <div className="stat-card">
                <div className="label">
                  自動配置
                </div>

                <div className="value">
                  {
                    planData.totalPlanned
                  }
                  分
                </div>
              </div>
            </section>

            <section className="card">
              <h2>
                {formatDateJP(
                  selectedDate
                )} の自動学習計画
              </h2>

              <p>
                固定予定と実際の空き時間を考慮し、優先度の高いタスクから配置しています。
              </p>

              {planData.plan.length ===
              0 ? (
                <p>
                  自動配置できるタスクがありません。
                </p>
              ) : (
                <div className="task-list">
                  {planData.plan.map(
                    (item) => (
                      <div
                        className="task-item"
                        key={
                          item.id
                        }
                      >
                        <div>
                          <h3>
                            {
                              item.start
                            }
                            〜
                            {
                              item.end
                            }
                          </h3>

                          <p>
                            {
                              item.subject
                            }
                            {"："}
                            {
                              item.title
                            }
                          </p>
                        </div>

                        <strong>
                          {
                            item.minutes
                          }
                          分
                        </strong>
                      </div>
                    )
                  )}
                </div>
              )}

              {planData.shortage >
              0 ? (
                <div className="error">
                  <strong>
                    学習時間不足
                  </strong>

                  <p>
                    あと{" "}
                    {
                      planData.shortage
                    }
                    分必要です。
                  </p>
                </div>
              ) : (
                <div className="success">
                  すべてのタスクを今日の空き時間に配置できます。
                </div>
              )}
            </section>

            <section className="card">
              <h2>
                時間の内訳
              </h2>

              <div className="task-list">
                {planData.freeSlots.map(
                  (
                    slot,
                    index
                  ) => (
                    <div
                      className="task-item"
                      key={index}
                    >
                      <div>
                        <h3>
                          {minutesToTime(
                            slot.start
                          )}
                          〜
                          {minutesToTime(
                            slot.end
                          )}
                        </h3>

                        <p>
                          学習可能
                        </p>
                      </div>

                      <strong>
                        {
                          slot.minutes
                        }
                        分
                      </strong>
                    </div>
                  )
                )}

                {planData.freeSlots
                  .length ===
                  0 && (
                  <p>
                    学習可能な時間帯がありません。
                  </p>
                )}
              </div>
            </section>
          </>
        )}

        {/* =================================
            CALENDAR
        ================================= */}

        {activeTab ===
          "calendar" && (
          <section className="card">
            <div
              style={{
                display:
                  "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                marginBottom: 20,
              }}
            >
              <button
                onClick={() =>
                  setCalendarMonth(
                    addDays(
                      `${calendarMonth.slice(
                        0,
                        7
                      )}-01`,
                      -1
                    )
                  )
                }
              >
                ←
              </button>

              <h2
                style={{
                  margin: 0,
                }}
              >
                {calendarMonth.slice(
                  0,
                  7
                )}
              </h2>

              <button
                onClick={() =>
                  setCalendarMonth(
                    addDays(
                      `${calendarMonth.slice(
                        0,
                        7
                      )}-01`,
                      32
                    )
                  )
                }
              >
                →
              </button>
            </div>

            <div className="calendar-grid">
              {[
                "日",
                "月",
                "火",
                "水",
                "木",
                "金",
                "土",
              ].map(
                (day) => (
                  <div
                    key={day}
                    style={{
                      textAlign:
                        "center",
                      fontWeight: 700,
                      padding:
                        "8px 0",
                      color:
                        "#64748b",
                    }}
                  >
                    {day}
                  </div>
                )
              )}

              {calendarDays.map(
                (
                  date,
                  index
                ) => {
                  if (!date) {
                    return (
                      <div
                        key={`empty-${index}`}
                      />
                    );
                  }

                  const dateTasks =
                    tasks.filter(
                      (task) =>
                        task.taskDate ===
                        date
                    );

                  const totalMinutes =
                    dateTasks.reduce(
                      (
                        sum,
                        task
                      ) =>
                        sum +
                        Number(
                          task.studiedMinutes ||
                            0
                        ),
                      0
                    );

                  return (
                    <button
                      key={date}
                      className={`calendar-day ${
                        date ===
                        selectedDate
                          ? "today"
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedDate(
                          date
                        )
                      }
                    >
                      <div>
                        {
                          Number(
                            date.slice(
                              8
                            )
                          )
                        }
                      </div>

                      {totalMinutes >
                        0 && (
                        <div
                          style={{
                            marginTop:
                              8,
                            fontSize:
                              11,
                            color:
                              "#4f46e5",
                          }}
                        >
                          {totalMinutes}
                          分
                        </div>
                      )}

                      {dateTasks.length >
                        0 && (
                        <div
                          style={{
                            marginTop:
                              4,
                            fontSize:
                              10,
                            color:
                              "#64748b",
                          }}
                        >
                          {
                            dateTasks.length
                          }
                          件
                        </div>
                      )}
                    </button>
                  );
                }
              )}
            </div>
          </section>
        )}

        {/* =================================
            PROGRESS
        ================================= */}

        {activeTab ===
          "progress" && (
          <>
            <section className="grid">
              <div className="stat-card">
                <div className="label">
                  総学習時間
                </div>

                <div className="value">
                  {
                    totalStudiedMinutes
                  }
                  分
                </div>
              </div>

              <div className="stat-card">
                <div className="label">
                  学習日数
                </div>

                <div className="value">
                  {
                    studyDays.size
                  }
                  日
                </div>
              </div>

              <div className="stat-card">
                <div className="label">
                  完了タスク
                </div>

                <div className="value">
                  {
                    completedTasks
                  }
                </div>
              </div>

              <div className="stat-card">
                <div className="label">
                  全体進捗
                </div>

                <div className="value">
                  {
                    completionRate
                  }
                  %
                </div>
              </div>
            </section>

            <section className="card">
              <h2>
                科目別学習量
              </h2>

              {Array.from(
                new Set(
                  tasks.map(
                    (task) =>
                      task.subject
                  )
                )
              ).map(
                (subject) => {
                  const minutes =
                    tasks
                      .filter(
                        (task) =>
                          task.subject ===
                          subject
                      )
                      .reduce(
                        (
                          sum,
                          task
                        ) =>
                          sum +
                          Number(
                            task.studiedMinutes ||
                              0
                          ),
                        0
                      );

                  const ratio =
                    totalStudiedMinutes >
                    0
                      ? Math.round(
                          (minutes /
                            totalStudiedMinutes) *
                            100
                        )
                      : 0;

                  return (
                    <div
                      key={
                        subject
                      }
                      style={{
                        marginBottom:
                          18,
                      }}
                    >
                      <div
                        style={{
                          display:
                            "flex",
                          justifyContent:
                            "space-between",
                          marginBottom:
                            6,
                        }}
                      >
                        <strong>
                          {
                            subject
                          }
                        </strong>

                        <span>
                          {
                            minutes
                          }
                          分
                        </span>
                      </div>

                      <div
                        style={{
                          height: 8,
                          background:
                            "#e5e7eb",
                          borderRadius:
                            999,
                          overflow:
                            "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${ratio}%`,
                            height:
                              "100%",
                            background:
                              "#4f46e5",
                          }}
                        />
                      </div>
                    </div>
                  );
                }
              )}
            </section>
          </>
        )}

        {/* =================================
            SETTINGS
        ================================= */}

        {activeTab ===
          "settings" && (
          <>
            <section className="card">
              <h2>
                学習時間設定
              </h2>

              <p>
                StudyFlowが「実際に勉強できる時間」を計算するための設定です。
              </p>

              <div className="form-grid">
                <label>
                  起床時刻

                  <input
                    type="time"
                    value={
                      settingsDraft.wakeUpTime
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        wakeUpTime:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  朝の支度時間（分）

                  <input
                    type="number"
                    min="0"
                    value={
                      settingsDraft.morningPrepMinutes
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        morningPrepMinutes:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />
                </label>

                <label>
                  学習開始時刻

                  <input
                    type="time"
                    value={
                      settingsDraft.studyStart
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        studyStart:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  学習終了時刻

                  <input
                    type="time"
                    value={
                      settingsDraft.studyEnd
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        studyEnd:
                          e.target
                            .value,
                      })
                    }
                  />
                </label>

                <label>
                  デフォルトタスク時間（分）

                  <input
                    type="number"
                    min="1"
                    value={
                      settingsDraft.defaultTaskMinutes
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        defaultTaskMinutes:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />
                </label>

                <label>
                  最小学習ブロック（分）

                  <input
                    type="number"
                    min="5"
                    value={
                      settingsDraft.minimumStudyBlock
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        minimumStudyBlock:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />
                </label>

                <label
                  style={{
                    display:
                      "flex",
                    flexDirection:
                      "row",
                    alignItems:
                      "center",
                    gap: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      settingsDraft.useStudyRoom
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        useStudyRoom:
                          e.target
                            .checked,
                      })
                    }
                  />

                  自習室を利用する
                </label>

                <label>
                  自習室までの移動時間（分）

                  <input
                    type="number"
                    min="0"
                    value={
                      settingsDraft.travelMinutes
                    }
                    disabled={
                      !settingsDraft.useStudyRoom
                    }
                    onChange={(e) =>
                      setSettingsDraft({
                        ...settingsDraft,
                        travelMinutes:
                          Number(
                            e.target
                              .value
                          ),
                      })
                    }
                  />
                </label>
              </div>

              <button
                className="primary"
                onClick={
                  saveSettings
                }
              >
                設定を保存
              </button>
            </section>

            <section className="card">
              <h2>
                現在の時間計算
              </h2>

              <div className="grid">
                <div className="stat-card">
                  <div className="label">
                    学習時間帯
                  </div>

                  <div
                    style={{
                      fontSize:
                        20,
                      fontWeight:
                        700,
                      marginTop:
                        8,
                    }}
                  >
                    {
                      settings.studyStart
                    }
                    〜
                    {
                      settings.studyEnd
                    }
                  </div>
                </div>

                <div className="stat-card">
                  <div className="label">
                    1日の学習可能時間
                  </div>

                  <div className="value">
                    {
                      timeAnalysis.totalAvailable
                    }
                    分
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

/* ========================================
   Render
======================================== */

createRoot(
  document.getElementById(
    "root"
  )
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
