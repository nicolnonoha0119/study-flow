import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import AIPlanPanel from "./AIPlanPanel";
import StudyGoalPanel from "./StudyGoalPanel";
import SchedulePanel from "./SchedulePanel";
import {
  normalizeStudyGoal,
  buildDailyGoalTasks,
} from "./studyGoalEngine";
import "./styles.css";

/*
==================================================
 StudyFlow
 AI搭載直前・統合版
==================================================

実装
・Supabase Auth
・プロフィール
・タスク管理
・固定予定
・勉強可能時間自動計算
・自動学習計画
・タイマー
・study_logs
・カレンダー
・週間/月間進捗
・科目別進捗
・設定
・localStorage fallback
・Supabase同期

AI搭載時には
generatePlan()
をAIによる計画生成部分と接続する。
==================================================
*/

const LOCAL_KEY = "studyflow_data_v4";

const DEFAULT_SETTINGS = {
  wakeUpTime: "07:00",
  morningPrepMinutes: 70,
  useStudyRoom: false,
  travelMinutes: 40,
  studyStart: "14:00",
  studyEnd: "19:20",
  defaultTaskMinutes: 45,
};



const SUBJECTS = [
  "数学",
  "英語",
  "物理",
  "化学",
  "国語",
  "研究",
  "その他",
];

const FIXED_CATEGORIES = [
  { value: "school", label: "学校" },
  { value: "cram", label: "塾" },
  { value: "club", label: "部活" },
  { value: "private", label: "予定" },
  { value: "other", label: "その他" },
];

function createId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function todayString() {
  const d = new Date();

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

function dateToString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");

  return `${y}-${m}-${d}`;
}

function formatDateJP(dateString) {
  if (!dateString) return "";

  const d = new Date(`${dateString}T00:00:00`);

  return d.toLocaleDateString("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function addDays(dateString, amount) {
  const d = new Date(`${dateString}T00:00:00`);
  d.setDate(d.getDate() + amount);
  return dateToString(d);
}

function changeMonth(dateString, amount) {
  const d = new Date(`${dateString.slice(0, 7)}-01T00:00:00`);

  d.setMonth(d.getMonth() + amount);

  return dateToString(d);
}

function getMonthStart(dateString) {
  return `${dateString.slice(0, 7)}-01`;
}

function getDaysInMonth(dateString) {
  const d = new Date(`${dateString.slice(0, 7)}-01T00:00:00`);

  return new Date(
    d.getFullYear(),
    d.getMonth() + 1,
    0
  ).getDate();
}

function timeToMinutes(time) {
  if (!time) return 0;

  const [h, m] = time.split(":").map(Number);

  return h * 60 + m;
}

function minutesToTime(minutes) {
  const safe = Math.max(0, Math.round(minutes));

  const h = Math.floor(safe / 60) % 24;
  const m = safe % 60;

  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}`;
}

function formatMinutes(minutes) {
  const total = Math.max(0, Math.round(minutes || 0));

  const h = Math.floor(total / 60);
  const m = total % 60;

  if (h === 0) return `${m}分`;

  if (m === 0) return `${h}時間`;

  return `${h}時間${m}分`;
}

function getWeekStart(dateString) {
  const d = new Date(`${dateString}T00:00:00`);
  const day = d.getDay();

  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);

  return dateToString(d);
}

function getMonthDates(dateString) {
  const first = new Date(`${dateString.slice(0, 7)}-01T00:00:00`);

  const year = first.getFullYear();
  const month = first.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;

  const days = new Date(year, month + 1, 0).getDate();

  const result = [];

  for (let i = 0; i < offset; i++) {
    result.push(null);
  }

  for (let i = 1; i <= days; i++) {
    result.push(
      `${year}-${String(month + 1).padStart(2, "0")}-${String(
        i
      ).padStart(2, "0")}`
    );
  }

  return result;
}

function normalizeTask(task, userId) {
  return {
    id: task.id || createId(),
    user_id: task.user_id || userId,
    subject: task.subject || "その他",
    title: task.title || "新しいタスク",
    minutes: Math.max(1, Number(task.minutes) || 45),
    priority: Math.min(
      5,
      Math.max(1, Number(task.priority) || 3)
    ),
    task_date: task.task_date || todayString(),
    completed: Boolean(task.completed),
    studied_minutes: Math.max(
      0,
      Number(task.studied_minutes) || 0
    ),
    created_at: task.created_at || new Date().toISOString(),
  };
}

function normalizeFixedSchedule(schedule, userId) {
  return {
    id: schedule.id || createId(),
    user_id: schedule.user_id || userId,
    title: schedule.title || "固定予定",
    category: schedule.category || "other",
    start_time: schedule.start_time || "09:00",
    end_time: schedule.end_time || "10:00",
    repeat_type: schedule.repeat_type || "today",
    schedule_date: schedule.schedule_date || todayString(),
    created_at: schedule.created_at || new Date().toISOString(),
  };
}

function normalizeSettings(settings) {
  const source = settings || {};

  return {
    ...DEFAULT_SETTINGS,
    wakeUpTime: source.wakeUpTime ?? source.wake_up_time ?? DEFAULT_SETTINGS.wakeUpTime,
    morningPrepMinutes: Math.max(
      0,
      Number(source.morningPrepMinutes ?? source.morning_prep_minutes) ||
        DEFAULT_SETTINGS.morningPrepMinutes
    ),
    useStudyRoom: Boolean(
      source.useStudyRoom ?? source.use_study_room ?? DEFAULT_SETTINGS.useStudyRoom
    ),
    travelMinutes: Math.max(
      0,
      Number(source.travelMinutes ?? source.travel_minutes) ||
        DEFAULT_SETTINGS.travelMinutes
    ),
    studyStart: source.studyStart ?? source.study_start ?? DEFAULT_SETTINGS.studyStart,
    studyEnd: source.studyEnd ?? source.study_end ?? DEFAULT_SETTINGS.studyEnd,
    defaultTaskMinutes: Math.max(
      1,
      Number(source.defaultTaskMinutes ?? source.default_task_minutes) ||
        DEFAULT_SETTINGS.defaultTaskMinutes
    ),
  };
}

function scheduleAppliesToDate(schedule, dateString) {
  if (schedule.repeat_type === "daily") {
    return true;
  }

  return schedule.schedule_date === dateString;
}

function getBlockedIntervals(dateString, settings, fixedSchedules) {
  const blocked = [];

  const studyStart = timeToMinutes(settings.studyStart);
  const studyEnd = timeToMinutes(settings.studyEnd);
  const wake = timeToMinutes(settings.wakeUpTime);

  /*
   勉強時間帯の外側
  */

  blocked.push({
    start: 0,
    end: Math.max(0, studyStart),
    type: "outside",
    label: "勉強開始前",
  });

  blocked.push({
    start: Math.min(1440, studyEnd),
    end: 1440,
    type: "outside",
    label: "勉強終了後",
  });

  /*
   起床前
  */

  if (wake > 0 && wake < studyStart) {
    blocked.push({
      start: 0,
      end: wake,
      type: "sleep",
      label: "起床前",
    });
  }

  /*
   朝の支度
  */

  const prepStart = wake;
  const prepEnd = wake + Number(settings.morningPrepMinutes || 0);

  if (prepEnd > prepStart && prepStart < studyStart) {
    blocked.push({
      start: prepStart,
      end: Math.min(prepEnd, studyStart),
      type: "prep",
      label: "朝の支度",
    });
  }

  /*
   自習室への移動
  */

  if (settings.useStudyRoom && settings.travelMinutes > 0) {
    const travelEnd = studyStart;
    const travelStart =
      studyStart - Number(settings.travelMinutes);

    blocked.push({
      start: Math.max(0, travelStart),
      end: travelEnd,
      type: "travel",
      label: "自習室への移動",
    });
  }

  /*
   固定予定
  */

  fixedSchedules
    .filter((s) => scheduleAppliesToDate(s, dateString))
    .forEach((schedule) => {
      const start = timeToMinutes(schedule.start_time);
      const end = timeToMinutes(schedule.end_time);

      if (end > start) {
        blocked.push({
          start,
          end,
          type: "fixed",
          label: schedule.title,
        });
      }
    });

  return mergeIntervals(blocked);
}

function mergeIntervals(intervals) {
  const sorted = [...intervals]
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);

  const result = [];

  for (const current of sorted) {
    const last = result[result.length - 1];

    if (!last || current.start > last.end) {
      result.push({ ...current });
    } else {
      last.end = Math.max(last.end, current.end);

      if (current.label && !last.label.includes(current.label)) {
        last.label += ` / ${current.label}`;
      }
    }
  }

  return result;
}

function getFreeSlots(dateString, settings, fixedSchedules) {
  const studyStart = timeToMinutes(settings.studyStart);
  const studyEnd = timeToMinutes(settings.studyEnd);

  if (studyEnd <= studyStart) return [];

  const blocked = getBlockedIntervals(
    dateString,
    settings,
    fixedSchedules
  );

  const relevant = blocked
    .filter(
      (x) =>
        x.end > studyStart &&
        x.start < studyEnd
    )
    .map((x) => ({
      start: Math.max(studyStart, x.start),
      end: Math.min(studyEnd, x.end),
    }))
    .sort((a, b) => a.start - b.start);

  const slots = [];

  let cursor = studyStart;

  for (const block of relevant) {
    if (block.start > cursor) {
      slots.push({
        start: cursor,
        end: block.start,
        minutes: block.start - cursor,
      });
    }

    cursor = Math.max(cursor, block.end);
  }

  if (cursor < studyEnd) {
    slots.push({
      start: cursor,
      end: studyEnd,
      minutes: studyEnd - cursor,
    });
  }

  return slots.filter((slot) => slot.minutes > 0);
}

function getAvailableMinutes(dateString, settings, fixedSchedules) {
  return getFreeSlots(
    dateString,
    settings,
    fixedSchedules
  ).reduce((sum, slot) => sum + slot.minutes, 0);
}

/*
==================================================
 自動計画エンジン

 AIを追加するときは、
 この関数の前後にAIによる判断を入れる。
==================================================
*/

function generatePlan({
  dateString,
  tasks,
  settings,
  fixedSchedules,
}) {
  const slots = getFreeSlots(
    dateString,
    settings,
    fixedSchedules
  );

  const available = slots.reduce(
    (sum, slot) => sum + slot.minutes,
    0
  );

  const targets = tasks
    .filter(
      (task) =>
        task.task_date === dateString &&
        !task.completed
    )
    .map((task) => ({
      ...task,
      remaining: Math.max(
        0,
        Number(task.minutes || 0) -
          Number(task.studied_minutes || 0)
      ),
    }))
    .filter((task) => task.remaining > 0)
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }

      return b.remaining - a.remaining;
    });

  const plan = [];

  let slotIndex = 0;
  let cursor =
    slots.length > 0 ? slots[0].start : 0;

  for (const task of targets) {
    let remaining = task.remaining;

    while (
      remaining > 0 &&
      slotIndex < slots.length
    ) {
      const slot = slots[slotIndex];

      if (cursor < slot.start) {
        cursor = slot.start;
      }

      const availableHere = slot.end - cursor;

      if (availableHere <= 0) {
        slotIndex += 1;

        if (slots[slotIndex]) {
          cursor = slots[slotIndex].start;
        }

        continue;
      }

      const amount = Math.min(
        remaining,
        availableHere
      );

      plan.push({
        id: createId(),
        taskId: task.id,
        title: task.title,
        subject: task.subject,
        priority: task.priority,
        start: cursor,
        end: cursor + amount,
        minutes: amount,
      });

      remaining -= amount;
      cursor += amount;

      if (cursor >= slot.end) {
        slotIndex += 1;

        if (slots[slotIndex]) {
          cursor = slots[slotIndex].start;
        }
      }
    }
  }

  const plannedMinutes = plan.reduce(
    (sum, item) => sum + item.minutes,
    0
  );

  const requiredMinutes = targets.reduce(
    (sum, task) => sum + task.remaining,
    0
  );

  const shortage = Math.max(
    0,
    requiredMinutes - plannedMinutes
  );

  const remainingAfterPlan = Math.max(
    0,
    available - plannedMinutes
  );

  return {
    plan,
    totalAvailable: available,
    totalRequired: requiredMinutes,
    plannedMinutes,
    shortage,
    remainingAfterPlan,
    slots,
  };
}

function getTaskRemaining(task) {
  return Math.max(
    0,
    Number(task.minutes || 0) -
      Number(task.studied_minutes || 0)
  );
}

function getSubjectStats(tasks) {
  const map = {};

  for (const task of tasks) {
    if (!map[task.subject]) {
      map[task.subject] = {
        subject: task.subject,
        planned: 0,
        studied: 0,
        completed: 0,
      };
    }

    map[task.subject].planned += Number(task.minutes || 0);
    map[task.subject].studied += Number(
      task.studied_minutes || 0
    );

    if (task.completed) {
      map[task.subject].completed += 1;
    }
  }

  return Object.values(map).sort(
    (a, b) => b.studied - a.studied
  );
}

/*
==================================================
 localStorage
==================================================
*/

function getLocalData() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);

    if (!raw) return null;

    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveLocalData(data) {
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify(data)
    );
  } catch {
    // localStorageが使用できない場合は無視
  }
}

/*
==================================================
 Auth
==================================================
*/

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();

    setMessage("");

    if (!email || !password) {
      setMessage("メールアドレスとパスワードを入力してください。");
      return;
    }

    if (mode === "signup" && !nickname.trim()) {
      setMessage("ニックネームを入力してください。");
      return;
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { error } =
          await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
          });

        if (error) throw error;
      } else {
        const {
          data,
          error,
        } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            nickname: nickname.trim(),
          });
        }

        setMessage(
          "アカウントを作成しました。メール確認が必要な場合は確認してください。"
        );
      }
    } catch (error) {
      setMessage(
        error?.message ||
          "認証に失敗しました。Supabaseの設定を確認してください。"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app auth-page">
      <main className="auth-container">
        <div className="auth-brand">
          <div className="brand-mark">S</div>
          <div>
            <div className="brand-name">StudyFlow</div>
            <div className="brand-subtitle">
              Your study, intelligently organized.
            </div>
          </div>
        </div>

        <div className="card auth-card">
          <div className="auth-tabs">
            <button
              className={
                mode === "login"
                  ? "auth-tab active"
                  : "auth-tab"
              }
              onClick={() => {
                setMode("login");
                setMessage("");
              }}
            >
              ログイン
            </button>

            <button
              className={
                mode === "signup"
                  ? "auth-tab active"
                  : "auth-tab"
              }
              onClick={() => {
                setMode("signup");
                setMessage("");
              }}
            >
              新規登録
            </button>
          </div>

          <div className="auth-heading">
            <h1>
              {mode === "login"
                ? "StudyFlowへようこそ"
                : "StudyFlowを始めよう"}
            </h1>

            <p>
              {mode === "login"
                ? "あなたの学習計画を続きから再開できます。"
                : "勉強時間を、もっとスマートに。"}
            </p>
          </div>

          <form onSubmit={submit}>
            {mode === "signup" && (
              <label>
                ニックネーム
                <input
                  value={nickname}
                  onChange={(e) =>
                    setNickname(e.target.value)
                  }
                  placeholder="例：Nicol"
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
                  setPassword(e.target.value)
                }
                placeholder="パスワード"
              />
            </label>

            {message && (
              <div className="message-box">
                {message}
              </div>
            )}

            <button
              className="primary-button auth-submit"
              disabled={loading}
              type="submit"
            >
              {loading
                ? "処理中..."
                : mode === "login"
                ? "ログイン"
                : "アカウントを作成"}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}

/*
==================================================
 App
==================================================
*/

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [fixedSchedules, setFixedSchedules] =
    useState([]);

  const [studyGoals, setStudyGoals] = useState([]);

  const [settings, setSettings] = useState(
    DEFAULT_SETTINGS
  );

  const [profile, setProfile] = useState({
    nickname: "",
  });

  const [studyLogs, setStudyLogs] = useState([]);

  const [loadingData, setLoadingData] = useState(false);

  const [activeTab, setActiveTab] = useState("today");

  const [selectedDate, setSelectedDate] =
    useState(todayString());

  const [calendarMonth, setCalendarMonth] =
    useState(todayString());

  const [message, setMessage] = useState("");

  const [aiAdoptedPlan, setAiAdoptedPlan] = useState(null);

  /*
  タスクフォーム
  */

  const [taskForm, setTaskForm] = useState({
    subject: "数学",
    title: "",
    minutes: 45,
    priority: 3,
    task_date: todayString(),
  });

  const [editingTaskId, setEditingTaskId] =
    useState(null);

  /*
  固定予定フォーム
  */

  const [fixedForm, setFixedForm] = useState({
    title: "",
    category: "other",
    start_time: "18:00",
    end_time: "19:00",
    repeat_type: "today",
    schedule_date: todayString(),
  });

  /*
  タイマー
  */

  const [timerTaskId, setTimerTaskId] =
    useState("");

  const [timerSeconds, setTimerSeconds] =
    useState(0);

  const [timerRunning, setTimerRunning] =
    useState(false);

  /*
  設定編集
  */

  const [settingsForm, setSettingsForm] =
    useState(DEFAULT_SETTINGS);

  const [nicknameForm, setNicknameForm] =
    useState("");

  /*
  ================================================
  Auth初期化
  ================================================
  */

  useEffect(() => {
    let mounted = true;

    const loadSession = async () => {
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();

      if (mounted) {
        setSession(currentSession);
        setAuthLoading(false);
      }
    };

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        if (mounted) {
          setSession(currentSession);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
  ================================================
  データ読み込み
  ================================================
  */

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    setLoadingData(true);
    setMessage("");

    try {
      const [
        tasksResult,
        fixedResult,
        studyGoalsResult,
        settingsResult,
        profileResult,
        logsResult,
      ] = await Promise.all([
        supabase
          .from("tasks")
          .select("*")
          .eq("user_id", userId)
          .order("task_date", {
            ascending: true,
          })
          .order("created_at", {
            ascending: true,
          }),

        supabase
          .from("fixed_schedules")
          .select("*")
          .eq("user_id", userId)
          .order("start_time", {
            ascending: true,
          }),

        supabase
          .from("study_goals")
          .select("*")
          .eq("user_id", userId)
          .order("deadline", { ascending: true }),

        supabase
          .from("study_settings")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),

        supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .maybeSingle(),

        supabase
          .from("study_logs")
          .select("*")
          .eq("user_id", userId)
          .order("study_date", {
            ascending: true,
          }),
      ]);

      const firstError = [
        tasksResult,
        fixedResult,
        studyGoalsResult,
        settingsResult,
        profileResult,
        logsResult,
      ].find((result) => result.error)?.error;

      if (firstError) {
        console.error("Supabaseデータ読み込みエラー:", firstError);
        throw firstError;
      }

      const remoteTasks =
        tasksResult.data?.map((task) =>
          normalizeTask(task, userId)
        ) || [];

      const remoteFixed =
        fixedResult.data?.map((schedule) =>
          normalizeFixedSchedule(schedule, userId)
        ) || [];

      const remoteStudyGoals =
        studyGoalsResult.data?.map((goal) =>
          normalizeStudyGoal(goal, userId)
        ) || [];

      const remoteSettings = normalizeSettings(
        settingsResult.data
      );

      /*
       認証済みユーザーの正本はSupabase。
       localStorageから古いタスク・設定を復元しない。
       これにより、削除済みタスクや以前の設定が
       勝手に復活することを防ぐ。
      */

      setTasks(remoteTasks);
      setFixedSchedules(remoteFixed);
      setStudyGoals(remoteStudyGoals);
      setSettings(remoteSettings);
      setSettingsForm(remoteSettings);

      /*
       Profile
      */

      let nextProfile =
        profileResult.data || null;

      if (!nextProfile) {
        const nickname =
          session.user.email?.split("@")[0] ||
          "StudyFlow User";

        const { data } = await supabase
          .from("profiles")
          .upsert({
            id: userId,
            nickname,
          })
          .select()
          .maybeSingle();

        nextProfile = data || {
          nickname,
        };
      }

      setProfile({
        nickname:
          nextProfile?.nickname ||
          session.user.email?.split("@")[0] ||
          "",
      });

      setNicknameForm(
        nextProfile?.nickname ||
          session.user.email?.split("@")[0] ||
          ""
      );

      setStudyLogs(logsResult.data || []);

    } catch (error) {
      console.error(error);
      setMessage(
        "データ読み込み中に問題が発生しました。"
      );
    } finally {
      setLoadingData(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      loadData();
    } else {
      setTasks([]);
      setFixedSchedules([]);
      setStudyGoals([]);
      setStudyLogs([]);
    }
  }, [session, loadData]);

  /*
  localStorageは認証済みデータの正本として使用しない。
  Supabaseの状態だけを表示・更新する。
  */

  /*
  ================================================
  Timer
  ================================================
  */

  useEffect(() => {
    if (!timerRunning) return;

    const interval = setInterval(() => {
      setTimerSeconds((seconds) => seconds + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRunning]);

  const timerDisplay = useMemo(() => {
    const hours = Math.floor(
      timerSeconds / 3600
    );

    const minutes = Math.floor(
      (timerSeconds % 3600) / 60
    );

    const seconds = timerSeconds % 60;

    return `${String(hours).padStart(2, "0")}:${String(
      minutes
    ).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }, [timerSeconds]);

  const saveTimerSession = async () => {
    if (!timerTaskId || timerSeconds <= 0) {
      setTimerRunning(false);
      return;
    }

    const studiedMinutes = Math.max(
      1,
      Math.floor(timerSeconds / 60)
    );

    const task = tasks.find(
      (item) => item.id === timerTaskId
    );

    if (!task) {
      setTimerRunning(false);
      return;
    }

    const nextStudied =
      Number(task.studied_minutes || 0) +
      studiedMinutes;

    const nextCompleted =
      nextStudied >= Number(task.minutes || 0);

    const updatedTask = {
      ...task,
      studied_minutes: nextStudied,
      completed: nextCompleted,
    };

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? updatedTask
          : item
      )
    );

    if (session?.user?.id) {
      const { error: taskUpdateError } = await supabase
        .from("tasks")
        .update({
          studied_minutes: nextStudied,
          completed: nextCompleted,
        })
        .eq("id", task.id)
        .eq("user_id", session.user.id);

      if (taskUpdateError) {
        console.error("タイマー学習記録エラー:", taskUpdateError);
        setTasks((current) =>
          current.map((item) => item.id === task.id ? task : item)
        );
        setMessage(`学習記録を保存できませんでした: ${taskUpdateError.message}`);
        setTimerSeconds(0);
        setTimerRunning(false);
        return;
      }

      /*
       study_logsを更新
      */

      const today = todayString();

      const existing = studyLogs.find(
        (log) => log.study_date === today
      );

      const nextLogMinutes =
        Number(existing?.minutes || 0) +
        studiedMinutes;

      const { data } = await supabase
        .from("study_logs")
        .upsert(
          {
            user_id: session.user.id,
            study_date: today,
            minutes: nextLogMinutes,
          },
          {
            onConflict:
              "user_id,study_date",
          }
        )
        .select()
        .maybeSingle();

      if (data) {
        setStudyLogs((current) => {
          const exists = current.some(
            (log) =>
              log.study_date === today
          );

          if (exists) {
            return current.map((log) =>
              log.study_date === today
                ? data
                : log
            );
          }

          return [...current, data];
        });
      }
    }

    setTimerSeconds(0);
    setTimerRunning(false);

    setMessage(
      `${formatMinutes(
        studiedMinutes
      )}の学習時間を記録しました。`
    );
  };

  const resetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
  };

  /*
  ================================================
  Task CRUD
  ================================================
  */

  const resetTaskForm = () => {
    setTaskForm({
      subject: "数学",
      title: "",
      minutes: settings.defaultTaskMinutes,
      priority: 3,
      task_date: selectedDate,
    });

    setEditingTaskId(null);
  };

  const saveTask = async (event) => {
    event.preventDefault();

    const title = taskForm.title.trim();

    if (!title) {
      setMessage("タスク名を入力してください。");
      return;
    }

    const userId = session?.user?.id;

    const duplicated = tasks.some(
      (task) =>
        task.id !== editingTaskId &&
        task.task_date === (taskForm.task_date || selectedDate) &&
        task.title.trim().toLowerCase() === title.toLowerCase()
    );

    if (duplicated) {
      setMessage("同じ日付に同じタスクがすでに登録されています。");
      return;
    }

    if (editingTaskId) {
      const oldTask = tasks.find(
        (task) => task.id === editingTaskId
      );

      if (!oldTask) return;

      const updated = {
        ...oldTask,
        subject: taskForm.subject,
        title,
        minutes: Math.max(
          1,
          Number(taskForm.minutes) || 45
        ),
        priority: Math.min(
          5,
          Math.max(
            1,
            Number(taskForm.priority) || 3
          )
        ),
        task_date:
          taskForm.task_date || selectedDate,
      };

      setTasks((current) =>
        current.map((task) =>
          task.id === editingTaskId
            ? updated
            : task
        )
      );

      if (userId) {
        const { error } = await supabase
          .from("tasks")
          .update({
            subject: updated.subject,
            title: updated.title,
            minutes: updated.minutes,
            priority: updated.priority,
            task_date: updated.task_date,
          })
          .eq("id", editingTaskId)
          .eq("user_id", userId);

        if (error) {
          console.error("タスク更新エラー:", error);
          setTasks((current) =>
            current.map((task) =>
              task.id === editingTaskId ? oldTask : task
            )
          );
          setMessage(`タスクを更新できませんでした: ${error.message}`);
          return;
        }
      }

      setMessage("タスクを更新しました。");
    } else {
      const newTask = normalizeTask(
        {
          id: createId(),
          user_id: userId,
          subject: taskForm.subject,
          title,
          minutes:
            Number(taskForm.minutes) || 45,
          priority:
            Number(taskForm.priority) || 3,
          task_date:
            taskForm.task_date || selectedDate,
          completed: false,
          studied_minutes: 0,
        },
        userId
      );

      setTasks((current) => [
        ...current,
        newTask,
      ]);

      if (userId) {
        const { error } = await supabase.from("tasks").insert({
          id: newTask.id,
          user_id: userId,
          subject: newTask.subject,
          title: newTask.title,
          minutes: newTask.minutes,
          priority: newTask.priority,
          task_date: newTask.task_date,
          completed: false,
          studied_minutes: 0,
        });

        if (error) {
          console.error("タスク追加エラー:", error);
          setTasks((current) =>
            current.filter((task) => task.id !== newTask.id)
          );
          setMessage(`タスクを追加できませんでした: ${error.message}`);
          return;
        }
      }

      setMessage("タスクを追加しました。");
    }

    resetTaskForm();
  };

  const editTask = (task) => {
    setEditingTaskId(task.id);

    setTaskForm({
      subject: task.subject,
      title: task.title,
      minutes: task.minutes,
      priority: task.priority,
      task_date: task.task_date,
    });

    setActiveTab("today");

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const toggleTask = async (task) => {
    const completed = !task.completed;

    const updated = {
      ...task,
      completed,
    };

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? updated
          : item
      )
    );

    if (session?.user?.id) {
      const { error } = await supabase
        .from("tasks")
        .update({ completed })
        .eq("id", task.id)
        .eq("user_id", session.user.id);

      if (error) {
        console.error("タスク完了状態更新エラー:", error);
        setTasks((current) =>
          current.map((item) =>
            item.id === task.id ? task : item
          )
        );
        setMessage(`タスクを更新できませんでした: ${error.message}`);
      }
    }
  };

  const deleteTask = async (taskId) => {
    if (
      !window.confirm(
        "このタスクを削除しますか？"
      )
    ) {
      return;
    }

    const deletedTask = tasks.find((task) => task.id === taskId);

    setTasks((current) =>
      current.filter((task) => task.id !== taskId)
    );

    if (session?.user?.id) {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("user_id", session.user.id);

      if (error) {
        console.error("タスク削除エラー:", error);
        if (deletedTask) {
          setTasks((current) => [...current, deletedTask]);
        }
        setMessage(`タスクを削除できませんでした: ${error.message}`);
        return;
      }
    }

    setMessage("タスクを削除しました。");

    if (timerTaskId === taskId) {
      resetTimer();
      setTimerTaskId("");
    }
  };

  /*
  ================================================
  Fixed schedule
  ================================================
  */

  const addFixedSchedule = async (event) => {
    event.preventDefault();

    if (!fixedForm.title.trim()) {
      setMessage("予定名を入力してください。");
      return;
    }

    if (
      timeToMinutes(fixedForm.end_time) <=
      timeToMinutes(fixedForm.start_time)
    ) {
      setMessage(
        "終了時刻は開始時刻より後にしてください。"
      );
      return;
    }

    const schedule = normalizeFixedSchedule(
      {
        id: createId(),
        user_id: session?.user?.id,
        ...fixedForm,
      },
      session?.user?.id
    );

    setFixedSchedules((current) => [
      ...current,
      schedule,
    ]);

    if (session?.user?.id) {
      await supabase
        .from("fixed_schedules")
        .insert({
          id: schedule.id,
          user_id: session.user.id,
          title: schedule.title,
          category: schedule.category,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          repeat_type: schedule.repeat_type,
          schedule_date:
            schedule.schedule_date,
        });
    }

    setFixedForm({
      title: "",
      category: "other",
      start_time: "18:00",
      end_time: "19:00",
      repeat_type: "today",
      schedule_date: selectedDate,
    });

    setMessage("固定予定を追加しました。");
  };

  const deleteFixedSchedule = async (
    scheduleId
  ) => {
    setFixedSchedules((current) =>
      current.filter(
        (schedule) =>
          schedule.id !== scheduleId
      )
    );

    if (session?.user?.id) {
      await supabase
        .from("fixed_schedules")
        .delete()
        .eq("id", scheduleId)
        .eq("user_id", session.user.id);
    }
  };

  /*
  ================================================
  Settings
  ================================================
  */

  const saveSettings = async (event) => {
    event.preventDefault();

    if (
      timeToMinutes(settingsForm.studyEnd) <=
      timeToMinutes(settingsForm.studyStart)
    ) {
      setMessage(
        "勉強終了時刻は開始時刻より後にしてください。"
      );
      return;
    }

    const nextSettings =
      normalizeSettings(settingsForm);

    setSettings(nextSettings);

    if (session?.user?.id) {
      const { error } = await supabase
        .from("study_settings")
        .upsert({
          user_id: session.user.id,
          wake_up_time:
            nextSettings.wakeUpTime,
          morning_prep_minutes:
            nextSettings.morningPrepMinutes,
          use_study_room:
            nextSettings.useStudyRoom,
          travel_minutes:
            nextSettings.travelMinutes,
          study_start:
            nextSettings.studyStart,
          study_end:
            nextSettings.studyEnd,
          default_task_minutes:
            nextSettings.defaultTaskMinutes,
        });

      if (error) {
        console.error(error);
        setMessage(
          "設定保存に失敗しました。"
        );
        return;
      }
    }

    setMessage("設定を保存しました。");
  };

  const saveNickname = async (event) => {
    event.preventDefault();

    const nickname = nicknameForm.trim();

    if (!nickname) {
      setMessage(
        "ニックネームを入力してください。"
      );
      return;
    }

    setProfile({ nickname });

    if (session?.user?.id) {
      await supabase
        .from("profiles")
        .upsert({
          id: session.user.id,
          nickname,
        });
    }

    setMessage("プロフィールを更新しました。");
  };

  /*
  ================================================
  参考書・学習目標 CRUD
  ================================================
  */

  const createStudyGoal = async (payload) => {
    const userId = session?.user?.id;
    if (!userId) {
      setMessage("ログインが必要です。");
      return;
    }

    const goal = normalizeStudyGoal(
      {
        id: createId(),
        user_id: userId,
        ...payload,
      },
      userId
    );

    setStudyGoals((current) => [...current, goal]);

    const { error } = await supabase
      .from("study_goals")
      .insert({
        id: goal.id,
        user_id: userId,
        title: goal.title,
        subject: goal.subject,
        total_pages: goal.total_pages,
        current_page: goal.current_page,
        deadline: goal.deadline,
        minutes_per_page: goal.minutes_per_page,
        priority: goal.priority,
        is_active: true,
      });

    if (error) {
      console.error(error);
      setStudyGoals((current) =>
        current.filter((item) => item.id !== goal.id)
      );
      setMessage("参考書の登録に失敗しました。");
      return;
    }

    setMessage("参考書を登録しました。毎日のページ目標を自動計算します。");
  };

  const updateStudyGoal = async (goalId, payload) => {
    const userId = session?.user?.id;
    if (!userId) return;

    const oldGoal = studyGoals.find((goal) => goal.id === goalId);
    if (!oldGoal) return;

    const nextGoal = normalizeStudyGoal(
      {
        ...oldGoal,
        ...payload,
        id: goalId,
        user_id: userId,
      },
      userId
    );

    setStudyGoals((current) =>
      current.map((goal) =>
        goal.id === goalId ? nextGoal : goal
      )
    );

    const { error } = await supabase
      .from("study_goals")
      .update({
        title: nextGoal.title,
        subject: nextGoal.subject,
        total_pages: nextGoal.total_pages,
        current_page: nextGoal.current_page,
        deadline: nextGoal.deadline,
        minutes_per_page: nextGoal.minutes_per_page,
        priority: nextGoal.priority,
        is_active: nextGoal.current_page < nextGoal.total_pages,
        completed_at:
          nextGoal.current_page >= nextGoal.total_pages
            ? new Date().toISOString()
            : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", goalId)
      .eq("user_id", userId);

    if (error) {
      console.error(error);
      setStudyGoals((current) =>
        current.map((goal) =>
          goal.id === goalId ? oldGoal : goal
        )
      );
      setMessage("参考書の更新に失敗しました。");
      return;
    }

    setMessage("参考書の進捗を更新しました。");
  };

  const completeStudyGoalToday = async (goalId, page) => {
    const goal = studyGoals.find((item) => item.id === goalId);
    if (!goal) return;

    const nextPage = Math.min(
      Number(goal.total_pages),
      Math.max(Number(goal.current_page), Number(page) || 0)
    );

    await updateStudyGoal(goalId, {
      current_page: nextPage,
    });
  };

  const deleteStudyGoal = async (goalId) => {
    if (!window.confirm("この参考書の目標を削除しますか？")) return;

    setStudyGoals((current) =>
      current.filter((goal) => goal.id !== goalId)
    );

    if (session?.user?.id) {
      const { error } = await supabase
        .from("study_goals")
        .delete()
        .eq("id", goalId)
        .eq("user_id", session.user.id);

      if (error) {
        console.error(error);
        setMessage("参考書の削除に失敗しました。");
        await loadData();
        return;
      }
    }

    setMessage("参考書を削除しました。");
  };

  const createScheduleFromPanel = async (payload) => {
    const schedule = normalizeFixedSchedule(
      {
        id: createId(),
        user_id: session?.user?.id,
        ...payload,
      },
      session?.user?.id
    );

    setFixedSchedules((current) => [...current, schedule]);

    if (session?.user?.id) {
      const { error } = await supabase
        .from("fixed_schedules")
        .insert({
          id: schedule.id,
          user_id: session.user.id,
          title: schedule.title,
          category: schedule.category,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          repeat_type: schedule.repeat_type,
          schedule_date: schedule.schedule_date,
        });

      if (error) {
        console.error(error);
        setFixedSchedules((current) =>
          current.filter((item) => item.id !== schedule.id)
        );
        setMessage("予定の登録に失敗しました。");
        return;
      }
    }

    setMessage("予定を追加しました。自動計画がこの時間を避けて再計算されます。");
  };

  /*
  ================================================
  自動計画
  ================================================
  */

  const dailyGoalTasks = useMemo(
    () =>
      buildDailyGoalTasks(
        studyGoals.filter((goal) => goal.is_active !== false),
        selectedDate
      ),
    [studyGoals, selectedDate]
  );

  const planningTasks = useMemo(
    () => [
      ...tasks.filter((task) => task.task_date === selectedDate),
      ...dailyGoalTasks,
    ],
    [tasks, dailyGoalTasks, selectedDate]
  );

  const planData = useMemo(
    () =>
      generatePlan({
        dateString: selectedDate,
        tasks: planningTasks,
        settings,
        fixedSchedules,
      }),
    [
      selectedDate,
      planningTasks,
      settings,
      fixedSchedules,
    ]
  );
  useEffect(() => {
    setAiAdoptedPlan(null);
  }, [selectedDate, tasks, studyGoals, settings, fixedSchedules]);
/*
================================================
Gemini AI plan
================================================
*/

const currentPlanForAI =
  aiAdoptedPlan || planData.plan;

const handleAdoptAIPlan = useCallback(
  (aiPlan) => {
    if (!Array.isArray(aiPlan)) {
      return;
    }

    const normalizedPlan = aiPlan
      .map((item, index) => {
        const start =
          typeof item.start === "number"
            ? item.start
            : timeToMinutes(item.start);

        const end =
          typeof item.end === "number"
            ? item.end
            : timeToMinutes(item.end);

        if (
          !Number.isFinite(start) ||
          !Number.isFinite(end) ||
          end <= start
        ) {
          return null;
        }

        const matchedTask = planningTasks.find(
          (task) => {
            if (item.taskId) {
              return task.id === item.taskId;
            }

            if (
              item.taskTitle &&
              task.title === item.taskTitle
            ) {
              return true;
            }

            if (
              item.title &&
              task.title === item.title
            ) {
              return true;
            }

            return false;
          }
        );

        return {
          id: `ai-${Date.now()}-${index}`,
          taskId:
            item.taskId ||
            matchedTask?.id ||
            null,
          title:
            item.taskTitle ||
            item.title ||
            matchedTask?.title ||
            "学習",
          subject:
            item.subject ||
            matchedTask?.subject ||
            "その他",
          priority:
            Number(
              item.priority ??
                matchedTask?.priority ??
                3
            ),
          start,
          end,
          minutes:
            Number(item.minutes) ||
            end - start,
          reason: item.reason || "",
          type: item.type || "study",
          aiGenerated: true,
        };
      })
      .filter(Boolean);

    setAiAdoptedPlan(normalizedPlan);

    setMessage(
      "Gemini AIの学習計画を採用しました。"
    );
  },
  [planningTasks]
);

  /*
  ================================================
  Today's tasks
  ================================================
  */

  const selectedTasks = useMemo(
    () =>
      tasks
        .filter(
          (task) =>
            task.task_date === selectedDate
        )
        .sort((a, b) => {
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }

          if (b.priority !== a.priority) {
            return b.priority - a.priority;
          }

          return a.created_at.localeCompare(
            b.created_at
          );
        }),
    [tasks, selectedDate]
  );

  const selectedFixedSchedules = useMemo(
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
            timeToMinutes(a.start_time) -
            timeToMinutes(b.start_time)
        ),
    [fixedSchedules, selectedDate]
  );

  /*
  ================================================
  Progress
  ================================================
  */

  const totalStudied = useMemo(
    () =>
      tasks.reduce(
        (sum, task) =>
          sum +
          Number(task.studied_minutes || 0),
        0
      ),
    [tasks]
  );

  const completedCount = useMemo(
    () =>
      tasks.filter((task) => task.completed)
        .length,
    [tasks]
  );

  const studyDays = useMemo(() => {
    const dates = new Set();

    for (const log of studyLogs) {
      if (Number(log.minutes || 0) > 0) {
        dates.add(log.study_date);
      }
    }

    for (const task of tasks) {
      if (
        Number(task.studied_minutes || 0) >
        0
      ) {
        dates.add(task.task_date);
      }
    }

    return dates.size;
  }, [studyLogs, tasks]);

  const studyStreak = useMemo(() => {
    const studiedDates = new Set();

    for (const log of studyLogs) {
      if (Number(log.minutes || 0) > 0) studiedDates.add(log.study_date);
    }
    for (const task of tasks) {
      if (Number(task.studied_minutes || 0) > 0) studiedDates.add(task.task_date);
    }

    let streak = 0;
    let cursor = todayString();
    while (studiedDates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }, [studyLogs, tasks]);

  const subjectStats = useMemo(
    () => getSubjectStats(tasks),
    [tasks]
  );

  const todayStudyMinutes = useMemo(() => {
    const log = studyLogs.find(
      (item) =>
        item.study_date === todayString()
    );

    if (log) {
      return Number(log.minutes || 0);
    }

    return tasks
      .filter(
        (task) =>
          task.task_date === todayString()
      )
      .reduce(
        (sum, task) =>
          sum +
          Number(task.studied_minutes || 0),
        0
      );
  }, [studyLogs, tasks]);

  const weekStudyMinutes = useMemo(() => {
    const start = getWeekStart(
      todayString()
    );

    let total = 0;

    for (let i = 0; i < 7; i++) {
      const date = addDays(start, i);

      const log = studyLogs.find(
        (item) => item.study_date === date
      );

      if (log) {
        total += Number(log.minutes || 0);
      }
    }

    return total;
  }, [studyLogs]);

  const monthStudyMinutes = useMemo(() => {
    const prefix =
      todayString().slice(0, 7);

    return studyLogs
      .filter((log) =>
        log.study_date.startsWith(prefix)
      )
      .reduce(
        (sum, log) =>
          sum + Number(log.minutes || 0),
        0
      );
  }, [studyLogs]);

  /*
  ================================================
  Calendar
  ================================================
  */

  const calendarDates = useMemo(
    () => getMonthDates(calendarMonth),
    [calendarMonth]
  );

  const calendarInfo = (date) => {
    if (!date) return null;

    const dateTasks = tasks.filter(
      (task) => task.task_date === date
    );

    const studied = dateTasks.reduce(
      (sum, task) =>
        sum +
        Number(task.studied_minutes || 0),
      0
    );

    const log = studyLogs.find(
      (item) => item.study_date === date
    );

    return {
      taskCount: dateTasks.length,
      completed: dateTasks.filter(
        (task) => task.completed
      ).length,
      studied: Math.max(
        studied,
        Number(log?.minutes || 0)
      ),
    };
  };

  /*
  ================================================
  Logout
  ================================================
  */

  const logout = async () => {
    await supabase.auth.signOut();

    setSession(null);
    setTasks([]);
    setFixedSchedules([]);
    setStudyGoals([]);
    setStudyLogs([]);
    setTimerRunning(false);
    setTimerSeconds(0);
  };

  /*
  ================================================
  Render
  ================================================
  */

  if (authLoading) {
    return (
      <div className="app loading-screen">
        <div className="loading-card">
          <div className="brand-mark">S</div>
          <h2>StudyFlow</h2>
          <p>読み込んでいます...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <div
            className="brand"
            onClick={() => setActiveTab("today")}
          >
            <div className="brand-mark">S</div>

            <div>
              <div className="brand-name">
                StudyFlow
              </div>

              <div className="brand-subtitle">
                Smart Study Planner
              </div>
            </div>
          </div>

          <div className="topbar-user">
            <span>
              {profile.nickname ||
                session.user.email}
            </span>

            <button
              className="ghost-button"
              onClick={logout}
            >
              ログアウト
            </button>
          </div>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <button
            className={
              activeTab === "today"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("today")
            }
          >
            <span>⌂</span>
            今日
          </button>

          <button
            className={
              activeTab === "plan"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("plan")
            }
          >
            <span>✦</span>
            自動計画
          </button>

          <button
            className={
              activeTab === "goals"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("goals")
            }
          >
            <span>▣</span>
            参考書
          </button>

          <button
            className={
              activeTab === "schedules"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("schedules")
            }
          >
            <span>◷</span>
            予定・時間
          </button>

          <button
            className={
              activeTab === "calendar"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("calendar")
            }
          >
            <span>□</span>
            カレンダー
          </button>

          <button
            className={
              activeTab === "progress"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("progress")
            }
          >
            <span>↗</span>
            進捗
          </button>

          <button
            className={
              activeTab === "settings"
                ? "nav-button active"
                : "nav-button"
            }
            onClick={() =>
              setActiveTab("settings")
            }
          >
            <span>⚙</span>
            設定
          </button>
        </aside>

        <main className="main-content">
          {loadingData && (
            <div className="loading-bar">
              データを同期しています...
            </div>
          )}

          {message && (
            <div className="global-message">
              {message}

              <button
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}

          {/*
          ========================================
          TODAY
          ========================================
          */}

          {activeTab === "today" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">
                    STUDYFLOW
                  </p>

                  <h1>
                    {selectedDate ===
                    todayString()
                      ? "今日の学習"
                      : formatDateJP(
                          selectedDate
                        )}
                  </h1>

                  <p className="page-description">
                    今日やることを整理して、
                    効率よく進めよう。
                  </p>
                </div>

                <div className="date-control">
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
                    value={selectedDate}
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
                </div>
              </div>

              <section className="stats-grid">
                <div className="stat-card">
                  <span>勉強可能時間</span>
                  <strong>
                    {formatMinutes(
                      getAvailableMinutes(
                        selectedDate,
                        settings,
                        fixedSchedules
                      )
                    )}
                  </strong>
                  <small>
                    固定予定を除外
                  </small>
                </div>

                <div className="stat-card">
                  <span>今日の学習</span>
                  <strong>
                    {formatMinutes(
                      todayStudyMinutes
                    )}
                  </strong>
                  <small>
                    実績
                  </small>
                </div>

                <div className="stat-card">
                  <span>未完了タスク</span>
                  <strong>
                    {
                      selectedTasks.filter(
                        (task) =>
                          !task.completed
                      ).length
                    }
                  </strong>
                  <small>
                    件
                  </small>
                </div>

                <div className="stat-card highlight">
                  <span>自動計画</span>
                  <strong>
                    {formatMinutes(
                      planData.plannedMinutes
                    )}
                  </strong>
                  <small>
                    配置済み
                  </small>
                </div>
              </section>

              <div className="content-grid">
                <AIPlanPanel
  date={selectedDate}
  tasks={planningTasks}
  fixedSchedules={selectedFixedSchedules}
  settings={settings}
  currentPlan={planData.plan}
  onAdopt={handleAdoptAIPlan}
/>
                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>タスク</h2>
                      <p>
                        学習する内容を登録
                      </p>
                    </div>
                  </div>

                  <form
                    className="task-form"
                    onSubmit={saveTask}
                  >
                    <div className="form-row">
                      <label>
                        科目
                        <select
                          value={
                            taskForm.subject
                          }
                          onChange={(e) =>
                            setTaskForm(
                              (current) => ({
                                ...current,
                                subject:
                                  e.target.value,
                              })
                            )
                          }
                        >
                          {SUBJECTS.map(
                            (subject) => (
                              <option
                                key={subject}
                                value={subject}
                              >
                                {subject}
                              </option>
                            )
                          )}
                        </select>
                      </label>

                      <label className="wide">
                        タスク
                        <input
                          value={
                            taskForm.title
                          }
                          onChange={(e) =>
                            setTaskForm(
                              (current) => ({
                                ...current,
                                title:
                                  e.target.value,
                              })
                            )
                          }
                          placeholder="例：数III 積分 例題20〜30"
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        必要時間
                        <input
                          type="number"
                          min="1"
                          value={
                            taskForm.minutes
                          }
                          onChange={(e) =>
                            setTaskForm(
                              (current) => ({
                                ...current,
                                minutes:
                                  e.target.value,
                              })
                            )
                          }
                        />
                      </label>

                      <label>
                        優先度
                        <select
                          value={
                            taskForm.priority
                          }
                          onChange={(e) =>
                            setTaskForm(
                              (current) => ({
                                ...current,
                                priority:
                                  Number(
                                    e.target.value
                                  ),
                              })
                            )
                          }
                        >
                          <option value="5">
                            ★★★★★
                          </option>
                          <option value="4">
                            ★★★★
                          </option>
                          <option value="3">
                            ★★★
                          </option>
                          <option value="2">
                            ★★
                          </option>
                          <option value="1">
                            ★
                          </option>
                        </select>
                      </label>

                      <label>
                        日付
                        <input
                          type="date"
                          value={
                            taskForm.task_date
                          }
                          onChange={(e) =>
                            setTaskForm(
                              (current) => ({
                                ...current,
                                task_date:
                                  e.target.value,
                              })
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="form-actions">
                      <button
                        className="primary-button"
                        type="submit"
                      >
                        {editingTaskId
                          ? "タスクを更新"
                          : "タスクを追加"}
                      </button>

                      {editingTaskId && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={
                            resetTaskForm
                          }
                        >
                          キャンセル
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="task-list">
                    {selectedTasks.length ===
                      0 && (
                      <div className="empty-state">
                        <div className="empty-icon">
                          ✓
                        </div>
                        <strong>
                          タスクはありません
                        </strong>
                        <p>
                          上から今日の勉強内容を追加できます。
                        </p>
                      </div>
                    )}

                    {selectedTasks.map(
                      (task) => {
                        const remaining =
                          getTaskRemaining(
                            task
                          );

                        const progress =
                          Math.min(
                            100,
                            Math.round(
                              (Number(
                                task.studied_minutes ||
                                  0
                              ) /
                                Math.max(
                                  1,
                                  Number(
                                    task.minutes ||
                                      1
                                  )
                                )) *
                                100
                            )
                          );

                        return (
                          <div
                            className={
                              task.completed
                                ? "task-item completed"
                                : "task-item"
                            }
                            key={task.id}
                          >
                            <button
                              className="check-button"
                              onClick={() =>
                                toggleTask(
                                  task
                                )
                              }
                            >
                              {task.completed
                                ? "✓"
                                : ""}
                            </button>

                            <div className="task-main">
                              <div className="task-title-row">
                                <span className="subject-tag">
                                  {
                                    task.subject
                                  }
                                </span>

                                <strong>
                                  {task.title}
                                </strong>
                              </div>

                              <div className="task-meta">
                                優先度{" "}
                                {"★".repeat(
                                  task.priority
                                )}{" "}
                                ·{" "}
                                {formatMinutes(
                                  task.minutes
                                )}{" "}
                                · 残り{" "}
                                {formatMinutes(
                                  remaining
                                )}
                              </div>

                              <div className="progress-line">
                                <div
                                  style={{
                                    width: `${progress}%`,
                                  }}
                                />
                              </div>
                            </div>

                            <div className="task-actions">
                              <button
                                onClick={() =>
                                  setTimerTaskId(
                                    task.id
                                  )
                                }
                              >
                                ▶
                              </button>

                              <button
                                onClick={() =>
                                  editTask(task)
                                }
                              >
                                編集
                              </button>

                              <button
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
                        );
                      }
                    )}
                  </div>
                </section>

                <div className="right-column">
                  <section className="card timer-card">
                    <div className="section-header">
                      <div>
                        <h2>学習タイマー</h2>
                        <p>
                          学習時間を自動記録
                        </p>
                      </div>
                    </div>

                    <select
                      value={timerTaskId}
                      onChange={(e) =>
                        setTimerTaskId(
                          e.target.value
                        )
                      }
                    >
                      <option value="">
                        タスクを選択
                      </option>

                      {selectedTasks
                        .filter(
                          (task) =>
                            !task.completed
                        )
                        .map((task) => (
                          <option
                            key={task.id}
                            value={task.id}
                          >
                            {task.subject}：
                            {task.title}
                          </option>
                        ))}
                    </select>

                    <div className="timer-display">
                      {timerDisplay}
                    </div>

                    <div className="timer-buttons">
                      <button
                        className="primary-button"
                        disabled={!timerTaskId}
                        onClick={() =>
                          setTimerRunning(
                            (current) =>
                              !current
                          )
                        }
                      >
                        {timerRunning
                          ? "一時停止"
                          : "スタート"}
                      </button>

                      <button
                        className="secondary-button"
                        onClick={resetTimer}
                      >
                        リセット
                      </button>

                      <button
                        className="secondary-button"
                        disabled={
                          !timerTaskId ||
                          timerSeconds === 0
                        }
                        onClick={
                          saveTimerSession
                        }
                      >
                        学習終了
                      </button>
                    </div>
                  </section>

                  <section className="card">
                    <div className="section-header">
                      <div>
                        <h2>固定予定</h2>
                        <p>
                          自動計画から除外されます
                        </p>
                      </div>
                      <button
                        type="button"
                        className="secondary-button small"
                        onClick={() => setActiveTab("schedules")}
                      >
                        予定を管理
                      </button>
                    </div>

                    <form
                      className="compact-form"
                      onSubmit={
                        addFixedSchedule
                      }
                    >
                      <input
                        value={
                          fixedForm.title
                        }
                        onChange={(e) =>
                          setFixedForm(
                            (current) => ({
                              ...current,
                              title:
                                e.target.value,
                            })
                          )
                        }
                        placeholder="例：塾"
                      />

                      <div className="form-row">
                        <input
                          type="time"
                          value={
                            fixedForm.start_time
                          }
                          onChange={(e) =>
                            setFixedForm(
                              (current) => ({
                                ...current,
                                start_time:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />

                        <input
                          type="time"
                          value={
                            fixedForm.end_time
                          }
                          onChange={(e) =>
                            setFixedForm(
                              (current) => ({
                                ...current,
                                end_time:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </div>

                      <div className="form-row">
                        <select
                          value={
                            fixedForm.category
                          }
                          onChange={(e) =>
                            setFixedForm(
                              (current) => ({
                                ...current,
                                category:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        >
                          {FIXED_CATEGORIES.map(
                            (category) => (
                              <option
                                key={
                                  category.value
                                }
                                value={
                                  category.value
                                }
                              >
                                {category.label}
                              </option>
                            )
                          )}
                        </select>

                        <select
                          value={
                            fixedForm.repeat_type
                          }
                          onChange={(e) =>
                            setFixedForm(
                              (current) => ({
                                ...current,
                                repeat_type:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        >
                          <option value="today">
                            この日のみ
                          </option>

                          <option value="daily">
                            毎日
                          </option>
                        </select>
                      </div>

                      <button
                        className="primary-button"
                        type="submit"
                      >
                        予定を追加
                      </button>
                    </form>

                    <div className="fixed-list">
                      {selectedFixedSchedules.length ===
                        0 && (
                        <p className="muted">
                          固定予定はありません。
                        </p>
                      )}

                      {selectedFixedSchedules.map(
                        (schedule) => (
                          <div
                            className="fixed-item"
                            key={schedule.id}
                          >
                            <div>
                              <strong>
                                {
                                  schedule.title
                                }
                              </strong>

                              <span>
                                {
                                  schedule.start_time
                                }{" "}
                                -{" "}
                                {
                                  schedule.end_time
                                }
                              </span>
                            </div>

                            <button
                              onClick={() =>
                                deleteFixedSchedule(
                                  schedule.id
                                )
                              }
                            >
                              ×
                            </button>
                          </div>
                        )
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}

          {/*
          ========================================
          PLAN
          ========================================
          */}

          {activeTab === "plan" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">
                    PLANNING ENGINE
                  </p>

                  <h1>自動学習計画</h1>

                  <p className="page-description">
                    優先度・残り時間・固定予定・空き時間から自動配置します。
                  </p>
                </div>

                <div className="date-control">
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
                    value={selectedDate}
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
                </div>
              </div>

              <section className="planning-summary">
                <div>
                  <span>勉強可能</span>
                  <strong>
                    {formatMinutes(
                      planData.totalAvailable
                    )}
                  </strong>
                </div>

                <div>
                  <span>必要</span>
                  <strong>
                    {formatMinutes(
                      planData.totalRequired
                    )}
                  </strong>
                </div>

                <div>
                  <span>配置済み</span>
                  <strong>
                    {formatMinutes(
                      planData.plannedMinutes
                    )}
                  </strong>
                </div>

                <div
                  className={
                    planData.shortage > 0
                      ? "danger"
                      : "success"
                  }
                >
                  <span>
                    {planData.shortage > 0
                      ? "不足"
                      : "余裕"}
                  </span>

                  <strong>
                    {formatMinutes(
                      planData.shortage > 0
                        ? planData.shortage
                        : planData.remainingAfterPlan
                    )}
                  </strong>
                </div>
              </section>

              {planData.shortage > 0 && (
                <div className="warning-card">
                  <strong>
                    今日の空き時間だけでは、
                    すべてのタスクを終えられません。
                  </strong>

                  <p>
                    優先度の高いタスクから自動的に配置しています。
                    残り{" "}
                    {formatMinutes(
                      planData.shortage
                    )}{" "}
                    あります。
                  </p>
                </div>
              )}

              <section className="card">
                <div className="section-header">
                  <div>
                    <h2>今日の自動計画</h2>
                    <p>
                      {formatDateJP(
                        selectedDate
                      )}
                    </p>
                  </div>
                </div>

              {currentPlanForAI.length ===
  0 && (
                  <div className="empty-state">
                    <strong>
                      配置できるタスクがありません
                    </strong>
                    <p>
                      タスクを追加するか、
                      固定予定・勉強時間帯を確認してください。
                    </p>
                  </div>
                )}

                <div className="form-actions" style={{ marginBottom: "16px" }}>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setAiAdoptedPlan(null)}
                  >
                    自動計画を再計算
                  </button>
                </div>

                <div className="plan-list">
                  {currentPlanForAI.map(
  (item) => (
                      <div
                        className="plan-item"
                        key={item.id}
                      >
                        <div className="plan-time">
                          {minutesToTime(
                            item.start
                          )}
                          <span>↓</span>
                          {minutesToTime(
                            item.end
                          )}
                        </div>

                        <div className="plan-bar">
                          <div
                            className="subject-tag"
                          >
                            {
                              item.subject
                            }
                          </div>

                          <strong>
                            {item.title}
                          </strong>

                          <span>
  {item.minutes}分 · 優先度{" "}
  {item.priority}

  {item.aiGenerated &&
    item.reason && (
      <> · {item.reason}</>
    )}
</span>
                        </div>

                        <button
                          className="secondary-button small"
                          onClick={() => {
                            if (item.goalId) {
                              setActiveTab("goals");
                              return;
                            }

                            setTimerTaskId(item.taskId);
                            setActiveTab("today");
                          }}
                        >
                          {item.goalId ? "参考書を開く" : "▶ 開始"}
                        </button>
                      </div>
                    )
                  )}
                </div>
              </section>

              <section className="card">
                <div className="section-header">
                  <div>
                    <h2>空き時間</h2>
                    <p>
                      自動計画が利用できる時間帯
                    </p>
                  </div>
                </div>

                <div className="slot-list">
                  {planData.slots.map(
                    (slot, index) => (
                      <div
                        className="slot-item"
                        key={`${slot.start}-${index}`}
                      >
                        <strong>
                          {minutesToTime(
                            slot.start
                          )}{" "}
                          -{" "}
                          {minutesToTime(
                            slot.end
                          )}
                        </strong>

                        <span>
                          {formatMinutes(
                            slot.minutes
                          )}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </section>
            </>
          )}

          {/*
          ========================================
          CALENDAR
          ========================================
          */}

          {activeTab === "goals" && (
            <StudyGoalPanel
              goals={studyGoals}
              selectedDate={selectedDate}
              subjects={SUBJECTS}
              onCreate={createStudyGoal}
              onUpdate={updateStudyGoal}
              onDelete={deleteStudyGoal}
              onCompleteToday={completeStudyGoalToday}
            />
          )}

          {activeTab === "schedules" && (
            <SchedulePanel
              selectedDate={selectedDate}
              schedules={selectedFixedSchedules}
              onCreate={createScheduleFromPanel}
              onDelete={deleteFixedSchedule}
            />
          )}

          {activeTab === "calendar" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">
                    CALENDAR
                  </p>

                  <h1>学習カレンダー</h1>

                  <p className="page-description">
                    学習予定と実績を月単位で確認できます。
                  </p>
                </div>
              </div>

              <section className="card calendar-card">
                <div className="calendar-header">
                  <button
                    onClick={() =>
                      setCalendarMonth(
                        changeMonth(
                          calendarMonth,
                          -1
                        )
                      )
                    }
                  >
                    ←
                  </button>

                  <h2>
                    {new Date(
                      `${calendarMonth.slice(
                        0,
                        7
                      )}-01T00:00:00`
                    ).toLocaleDateString(
                      "ja-JP",
                      {
                        year: "numeric",
                        month: "long",
                      }
                    )}
                  </h2>

                  <button
                    onClick={() =>
                      setCalendarMonth(
                        changeMonth(
                          calendarMonth,
                          1
                        )
                      )
                    }
                  >
                    →
                  </button>
                </div>

                <div className="calendar-week">
                  {[
                    "月",
                    "火",
                    "水",
                    "木",
                    "金",
                    "土",
                    "日",
                  ].map((day) => (
                    <div key={day}>
                      {day}
                    </div>
                  ))}
                </div>

                <div className="calendar-grid">
                  {calendarDates.map(
                    (date, index) => {
                      if (!date) {
                        return (
                          <div
                            className="calendar-day empty"
                            key={`empty-${index}`}
                          />
                        );
                      }

                      const info =
                        calendarInfo(
                          date
                        );

                      const isSelected =
                        date ===
                        selectedDate;

                      const isToday =
                        date ===
                        todayString();

                      return (
                        <button
                          className={`calendar-day ${
                            isSelected
                              ? "selected"
                              : ""
                          } ${
                            isToday
                              ? "today"
                              : ""
                          }`}
                          key={date}
                          onClick={() => {
                            setSelectedDate(
                              date
                            );
                            setActiveTab(
                              "today"
                            );
                          }}
                        >
                          <strong>
                            {Number(
                              date.slice(8)
                            )}
                          </strong>

                          {info.taskCount >
                            0 && (
                            <span>
                              {info.completed}/
                              {
                                info.taskCount
                              }{" "}
                              tasks
                            </span>
                          )}

                          {info.studied > 0 && (
                            <small>
                              {formatMinutes(
                                info.studied
                              )}
                            </small>
                          )}
                        </button>
                      );
                    }
                  )}
                </div>
              </section>
            </>
          )}

          {/*
          ========================================
          PROGRESS
          ========================================
          */}

          {activeTab === "progress" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">
                    PROGRESS
                  </p>

                  <h1>学習進捗</h1>

                  <p className="page-description">
                    これまでの学習量を確認できます。
                  </p>
                </div>
              </div>

              <section className="stats-grid">
                <div className="stat-card">
                  <span>累計学習</span>
                  <strong>
                    {formatMinutes(
                      totalStudied
                    )}
                  </strong>
                  <small>
                    タスク実績
                  </small>
                </div>

                <div className="stat-card">
                  <span>今日</span>
                  <strong>
                    {formatMinutes(
                      todayStudyMinutes
                    )}
                  </strong>
                  <small>
                    学習時間
                  </small>
                </div>

                <div className="stat-card">
                  <span>今週</span>
                  <strong>
                    {formatMinutes(
                      weekStudyMinutes
                    )}
                  </strong>
                  <small>
                    月曜〜日曜
                  </small>
                </div>

                <div className="stat-card">
                  <span>学習日数</span>
                  <strong>
                    {studyDays}
                  </strong>
                  <small>
                    日
                  </small>
                </div>

                <div className="stat-card highlight">
                  <span>連続学習</span>
                  <strong>{studyStreak}</strong>
                  <small>日連続</small>
                </div>
              </section>

              <div className="content-grid">
                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>科目別</h2>
                      <p>
                        学習時間の内訳
                      </p>
                    </div>
                  </div>

                  <div className="subject-progress">
                    {subjectStats.length ===
                      0 && (
                      <p className="muted">
                        まだ学習記録がありません。
                      </p>
                    )}

                    {subjectStats.map(
                      (item) => {
                        const max =
                          Math.max(
                            1,
                            ...subjectStats.map(
                              (x) =>
                                x.studied
                            )
                          );

                        const width =
                          (item.studied /
                            max) *
                          100;

                        return (
                          <div
                            className="subject-progress-item"
                            key={
                              item.subject
                            }
                          >
                            <div className="subject-progress-header">
                              <strong>
                                {
                                  item.subject
                                }
                              </strong>

                              <span>
                                {formatMinutes(
                                  item.studied
                                )}
                              </span>
                            </div>

                            <div className="progress-line large">
                              <div
                                style={{
                                  width: `${width}%`,
                                }}
                              />
                            </div>

                            <small>
                              完了{" "}
                              {
                                item.completed
                              }{" "}
                              件
                            </small>
                          </div>
                        );
                      }
                    )}
                  </div>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>タスク達成</h2>
                      <p>
                        現在の全タスク状況
                      </p>
                    </div>
                  </div>

                  <div className="big-progress">
                    <div className="big-progress-number">
                      {tasks.length > 0
                        ? Math.round(
                            (completedCount /
                              tasks.length) *
                              100
                          )
                        : 0}
                      <span>%</span>
                    </div>

                    <p>
                      {completedCount} /{" "}
                      {tasks.length} タスク完了
                    </p>
                  </div>

                  <div className="progress-line large">
                    <div
                      style={{
                        width: `${
                          tasks.length > 0
                            ? (completedCount /
                                tasks.length) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </section>
              </div>

              <section className="card">
                <div className="section-header">
                  <div>
                    <h2>学習ログ</h2>
                    <p>
                      今月の記録
                    </p>
                  </div>

                  <strong>
                    {formatMinutes(
                      monthStudyMinutes
                    )}
                  </strong>
                </div>

                <div className="log-list">
                  {studyLogs
                    .slice(-14)
                    .reverse()
                    .map((log) => (
                      <div
                        className="log-item"
                        key={log.id}
                      >
                        <span>
                          {formatDateJP(
                            log.study_date
                          )}
                        </span>

                        <strong>
                          {formatMinutes(
                            log.minutes
                          )}
                        </strong>
                      </div>
                    ))}

                  {studyLogs.length ===
                    0 && (
                    <p className="muted">
                      学習ログはまだありません。
                    </p>
                  )}
                </div>
              </section>
            </>
          )}

          {/*
          ========================================
          SETTINGS
          ========================================
          */}

          {activeTab === "settings" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">
                    SETTINGS
                  </p>

                  <h1>設定</h1>

                  <p className="page-description">
                    StudyFlowがあなたの生活に合わせて計画を作れるように設定します。
                  </p>
                </div>
              </div>

              <div className="settings-grid">
                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>プロフィール</h2>
                      <p>
                        表示名を設定
                      </p>
                    </div>
                  </div>

                  <form
                    onSubmit={saveNickname}
                    className="settings-form"
                  >
                    <label>
                      ニックネーム
                      <input
                        value={
                          nicknameForm
                        }
                        onChange={(e) =>
                          setNicknameForm(
                            e.target.value
                          )
                        }
                      />
                    </label>

                    <label>
                      ログインメール
                      <input
                        value={
                          session.user.email ||
                          ""
                        }
                        disabled
                      />
                    </label>

                    <button
                      className="primary-button"
                      type="submit"
                    >
                      プロフィールを保存
                    </button>
                  </form>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>学習時間</h2>
                      <p>
                        自動計画の基準
                      </p>
                    </div>
                  </div>

                  <form
                    className="settings-form"
                    onSubmit={
                      saveSettings
                    }
                  >
                    <div className="form-row">
                      <label>
                        起床時刻
                        <input
                          type="time"
                          value={
                            settingsForm.wakeUpTime
                          }
                          onChange={(e) =>
                            setSettingsForm(
                              (current) => ({
                                ...current,
                                wakeUpTime:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>

                      <label>
                        朝の支度
                        <input
                          type="number"
                          min="0"
                          value={
                            settingsForm.morningPrepMinutes
                          }
                          onChange={(e) =>
                            setSettingsForm(
                              (current) => ({
                                ...current,
                                morningPrepMinutes:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        勉強開始
                        <input
                          type="time"
                          value={
                            settingsForm.studyStart
                          }
                          onChange={(e) =>
                            setSettingsForm(
                              (current) => ({
                                ...current,
                                studyStart:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>

                      <label>
                        勉強終了
                        <input
                          type="time"
                          value={
                            settingsForm.studyEnd
                          }
                          onChange={(e) =>
                            setSettingsForm(
                              (current) => ({
                                ...current,
                                studyEnd:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>
                    </div>

                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={
                          settingsForm.useStudyRoom
                        }
                        onChange={(e) =>
                          setSettingsForm(
                            (current) => ({
                              ...current,
                              useStudyRoom:
                                e.target
                                  .checked,
                            })
                          )
                        }
                      />

                      <span>
                        自習室を利用する
                      </span>
                    </label>

                    {settingsForm.useStudyRoom && (
                      <label>
                        自習室までの移動時間
                        <input
                          type="number"
                          min="0"
                          value={
                            settingsForm.travelMinutes
                          }
                          onChange={(e) =>
                            setSettingsForm(
                              (current) => ({
                                ...current,
                                travelMinutes:
                                  e.target
                                    .value,
                              })
                            )
                          }
                        />
                      </label>
                    )}

                    <label>
                      タスクのデフォルト時間
                      <input
                        type="number"
                        min="1"
                        value={
                          settingsForm.defaultTaskMinutes
                        }
                        onChange={(e) =>
                          setSettingsForm(
                            (current) => ({
                              ...current,
                              defaultTaskMinutes:
                                e.target
                                  .value,
                            })
                          )
                        }
                      />
                    </label>

                    <button
                      className="primary-button"
                      type="submit"
                    >
                      設定を保存
                    </button>
                  </form>
                </section>
              </div>

              <section className="card">
                <div className="section-header">
                  <div>
                    <h2>現在の自動計画条件</h2>
                    <p>
                      StudyFlowが計算に使用している値
                    </p>
                  </div>
                </div>

                <div className="condition-grid">
                  <div>
                    <span>起床</span>
                    <strong>
                      {settings.wakeUpTime}
                    </strong>
                  </div>

                  <div>
                    <span>朝の支度</span>
                    <strong>
                      {
                        settings.morningPrepMinutes
                      }
                      分
                    </strong>
                  </div>

                  <div>
                    <span>勉強時間</span>
                    <strong>
                      {settings.studyStart}〜
                      {settings.studyEnd}
                    </strong>
                  </div>

                  <div>
                    <span>自習室</span>
                    <strong>
                      {settings.useStudyRoom
                        ? `利用・${settings.travelMinutes}分`
                        : "利用しない"}
                    </strong>
                  </div>

                  <div>
                    <span>今日の空き時間</span>
                    <strong>
                      {formatMinutes(
                        getAvailableMinutes(
                          selectedDate,
                          settings,
                          fixedSchedules
                        )
                      )}
                    </strong>
                  </div>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

createRoot(
  document.getElementById("root")
).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
