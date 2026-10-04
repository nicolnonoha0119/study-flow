import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import "./styles.css";

/*
========================================
 StudyFlow
 Supabase Connected Version
========================================

・メールアドレス / パスワード認証
・Supabase保存
・localStorageからの初回移行
・今日の予定
・自動スケジュール
・固定予定
・空き時間計算
・タスク管理
・カレンダー
・進捗
・タイマー
・設定
========================================
*/

const LOCAL_KEY = "studyflow_all_in_one_v1";

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
  studyEnd: "19:20",
  defaultTaskMinutes: 45,
};

const FIXED_CATEGORIES = {
  school: "学校",
  cram: "塾",
  club: "部活",
  research: "研究",
  other: "その他",
};

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
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
  localStorage.setItem(
    LOCAL_KEY,
    JSON.stringify({
      tasks: data.tasks || [],
      fixedSchedules: data.fixedSchedules || [],
      settings: data.settings || DEFAULT_SETTINGS,
    })
  );
}

function normalizeTask(task) {
  return {
    id: task.id || crypto.randomUUID(),
    subject: task.subject || "その他",
    title: task.title || "無題のタスク",
    minutes: Number(task.minutes) || 30,
    priority: Number(task.priority) || 3,
    taskDate: task.taskDate || task.task_date || todayString(),
    completed: Boolean(task.completed),
    studiedMinutes:
      Number(task.studiedMinutes ?? task.studied_minutes) || 0,
  };
}

function normalizeFixedSchedule(schedule) {
  return {
    id: schedule.id || crypto.randomUUID(),
    title: schedule.title || "予定",
    category: schedule.category || "other",
    startTime: schedule.startTime || schedule.start_time || "09:00",
    endTime: schedule.endTime || schedule.end_time || "10:00",
    repeatType:
      schedule.repeatType || schedule.repeat_type || "today",
    scheduleDate:
      schedule.scheduleDate || schedule.schedule_date || todayString(),
  };
}

function scheduleAppliesToDate(schedule, date) {
  if (schedule.repeatType === "daily") return true;
  return schedule.scheduleDate === date;
}

function getBlockedIntervals(date, settings, fixedSchedules) {
  const intervals = [];

  // 起床前
  intervals.push({
    start: 0,
    end: timeToMinutes(settings.wakeUpTime),
  });

  // 朝の支度
  const prepStart = timeToMinutes(settings.wakeUpTime);
  intervals.push({
    start: prepStart,
    end: prepStart + Number(settings.morningPrepMinutes || 0),
  });

  // 自習室への移動
  if (settings.useStudyRoom) {
    const studyStart = timeToMinutes(settings.studyStart);
    intervals.push({
      start: studyStart - Number(settings.travelMinutes || 0),
      end: studyStart,
    });
  }

  const studyStart = timeToMinutes(settings.studyStart);
  const studyEnd = timeToMinutes(settings.studyEnd);

  // 学習可能時間外
  intervals.push({
    start: 0,
    end: studyStart,
  });

  intervals.push({
    start: studyEnd,
    end: 24 * 60,
  });

  fixedSchedules
    .filter((s) => scheduleAppliesToDate(s, date))
    .forEach((s) => {
      intervals.push({
        start: timeToMinutes(s.startTime),
        end: timeToMinutes(s.endTime),
      });
    });

  return mergeIntervals(intervals);
}

function mergeIntervals(intervals) {
  const valid = intervals
    .filter((x) => x.end > x.start)
    .sort((a, b) => a.start - b.start);

  const result = [];

  for (const interval of valid) {
    if (!result.length) {
      result.push({ ...interval });
      continue;
    }

    const last = result[result.length - 1];

    if (interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      result.push({ ...interval });
    }
  }

  return result;
}

function getFreeSlots(date, settings, fixedSchedules) {
  const studyStart = timeToMinutes(settings.studyStart);
  const studyEnd = timeToMinutes(settings.studyEnd);

  const blocked = getBlockedIntervals(date, settings, fixedSchedules);

  const relevant = blocked
    .filter((x) => x.end > studyStart && x.start < studyEnd)
    .map((x) => ({
      start: Math.max(x.start, studyStart),
      end: Math.min(x.end, studyEnd),
    }));

  const merged = mergeIntervals(relevant);

  const slots = [];
  let cursor = studyStart;

  for (const block of merged) {
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

function generatePlan(date, tasks, settings, fixedSchedules) {
  const freeSlots = getFreeSlots(date, settings, fixedSchedules);

  const availableTasks = tasks
    .filter((task) => task.taskDate === date && !task.completed)
    .map((task) => ({
      ...task,
      remaining: Math.max(
        0,
        Number(task.minutes) - Number(task.studiedMinutes || 0)
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
  let taskIndex = 0;

  for (const slot of freeSlots) {
    let cursor = slot.start;

    while (
      cursor < slot.end &&
      taskIndex < availableTasks.length
    ) {
      const task = availableTasks[taskIndex];

      const remainingSlot = slot.end - cursor;
      const amount = Math.min(task.remaining, remainingSlot);

      if (amount <= 0) {
        taskIndex++;
        continue;
      }

      plan.push({
        taskId: task.id,
        subject: task.subject,
        title: task.title,
        start: minutesToTime(cursor),
        end: minutesToTime(cursor + amount),
        minutes: amount,
      });

      cursor += amount;
      task.remaining -= amount;

      if (task.remaining <= 0) {
        taskIndex++;
      }
    }
  }

  const totalAvailable = freeSlots.reduce(
    (sum, slot) => sum + slot.minutes,
    0
  );

  const totalRequired = availableTasks.reduce(
    (sum, task) => sum + task.remaining,
    0
  );

  return {
    plan,
    totalAvailable,
    totalRequired,
    shortage: Math.max(0, totalRequired - totalAvailable),
    remainingAfterPlan: Math.max(
      0,
      totalRequired - totalAvailable
    ),
  };
}

function supabaseTaskToLocal(task) {
  return normalizeTask({
    id: task.id,
    subject: task.subject,
    title: task.title,
    minutes: task.minutes,
    priority: task.priority,
    taskDate: task.task_date,
    completed: task.completed,
    studiedMinutes: task.studied_minutes,
  });
}

function localTaskToSupabase(task, userId) {
  return {
    id: task.id,
    user_id: userId,
    subject: task.subject,
    title: task.title,
    minutes: Number(task.minutes) || 30,
    priority: Number(task.priority) || 3,
    task_date: task.taskDate,
    completed: Boolean(task.completed),
    studied_minutes: Number(task.studiedMinutes) || 0,
  };
}

function supabaseScheduleToLocal(schedule) {
  return normalizeFixedSchedule({
    id: schedule.id,
    title: schedule.title,
    category: schedule.category,
    startTime: schedule.start_time,
    endTime: schedule.end_time,
    repeatType: schedule.repeat_type,
    scheduleDate: schedule.schedule_date,
  });
}

function localScheduleToSupabase(schedule, userId) {
  return {
    id: schedule.id,
    user_id: userId,
    title: schedule.title,
    category: schedule.category,
    start_time: schedule.startTime,
    end_time: schedule.endTime,
    repeat_type: schedule.repeatType,
    schedule_date:
      schedule.repeatType === "daily"
        ? null
        : schedule.scheduleDate,
  };
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      if (!email || !password) {
        throw new Error("メールアドレスとパスワードを入力してください。");
      }

      if (mode === "signup") {
        const { data, error: signUpError } =
          await supabase.auth.signUp({
            email,
            password,
          });

        if (signUpError) throw signUpError;

        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            nickname: nickname || "StudyFlow User",
          });
        }

        if (!data.session) {
          setMessage(
            "登録しました。メール確認が必要な場合は、届いたメールを確認してください。"
          );
        } else {
          onAuthenticated(data.session.user);
        }
      } else {
        const { data, error: loginError } =
          await supabase.auth.signInWithPassword({
            email,
            password,
          });

        if (loginError) throw loginError;

        onAuthenticated(data.user);
      }
    } catch (err) {
      setError(err.message || "認証に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <main className="auth-container">
        <div className="card auth-card">
          <h1>StudyFlow</h1>

          <p>
            {mode === "login"
              ? "ログインして学習データを同期しましょう。"
              : "StudyFlowのアカウントを作成します。"}
          </p>

          <form onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label>
                ニックネーム
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="ニックネーム"
                />
              </label>
            )}

            <label>
              メールアドレス
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
              />
            </label>

            <label>
              パスワード
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6文字以上"
              />
            </label>

            {error && <p className="error">{error}</p>}
            {message && <p className="success">{message}</p>}

            <button type="submit" disabled={loading}>
              {loading
                ? "処理中..."
                : mode === "login"
                ? "ログイン"
                : "新規登録"}
            </button>
          </form>

          <button
            className="secondary-button"
            onClick={() => {
              setMode(mode === "login" ? "signup" : "login");
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
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [activeTab, setActiveTab] = useState("today");
  const [selectedDate, setSelectedDate] = useState(todayString());

  const [tasks, setTasks] = useState([]);
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [loadingData, setLoadingData] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  const [newTask, setNewTask] = useState({
    subject: "数学",
    title: "",
    minutes: 45,
    priority: 3,
  });

  const [newSchedule, setNewSchedule] = useState({
    title: "",
    category: "school",
    startTime: "09:00",
    endTime: "10:00",
    repeatType: "today",
  });

  const [timerTaskId, setTimerTaskId] = useState("");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  const [calendarMonth, setCalendarMonth] =
    useState(todayString());

  const [settingsDraft, setSettingsDraft] =
    useState(DEFAULT_SETTINGS);

  /*
  ----------------------------------------
  Auth
  ----------------------------------------
  */

  useEffect(() => {
    let mounted = true;

    async function loadSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setUser(session?.user || null);
        setAuthLoading(false);
      }
    }

    loadSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  /*
  ----------------------------------------
  Supabase Data
  ----------------------------------------
  */

  async function loadSupabaseData(currentUser) {
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
          .eq("user_id", currentUser.id)
          .order("task_date", { ascending: true }),

        supabase
          .from("fixed_schedules")
          .select("*")
          .eq("user_id", currentUser.id)
          .order("start_time", { ascending: true }),

        supabase
          .from("study_settings")
          .select("*")
          .eq("user_id", currentUser.id)
          .maybeSingle(),
      ]);

      if (tasksResult.error) throw tasksResult.error;
      if (schedulesResult.error) throw schedulesResult.error;
      if (settingsResult.error) throw settingsResult.error;

      const remoteTasks =
        tasksResult.data?.map(supabaseTaskToLocal) || [];

      const remoteSchedules =
        schedulesResult.data?.map(supabaseScheduleToLocal) || [];

      const remoteSettings = settingsResult.data
        ? {
            wakeUpTime:
              settingsResult.data.wake_up_time?.slice(0, 5) ||
              DEFAULT_SETTINGS.wakeUpTime,
            morningPrepMinutes:
              settingsResult.data.morning_prep_minutes ??
              DEFAULT_SETTINGS.morningPrepMinutes,
            useStudyRoom:
              settingsResult.data.use_study_room ??
              DEFAULT_SETTINGS.useStudyRoom,
            travelMinutes:
              settingsResult.data.travel_minutes ??
              DEFAULT_SETTINGS.travelMinutes,
            studyStart:
              settingsResult.data.study_start?.slice(0, 5) ||
              DEFAULT_SETTINGS.studyStart,
            studyEnd:
              settingsResult.data.study_end?.slice(0, 5) ||
              DEFAULT_SETTINGS.studyEnd,
            defaultTaskMinutes:
              settingsResult.data.default_task_minutes ??
              DEFAULT_SETTINGS.defaultTaskMinutes,
          }
        : null;

      const localData = getLocalData();

      /*
      初回のみlocalStorageのデータをSupabaseへ移行
      */
      if (
        remoteTasks.length === 0 &&
        remoteSchedules.length === 0 &&
        !remoteSettings &&
        localData
      ) {
        const localTasks = localData.tasks.map(normalizeTask);
        const localSchedules =
          localData.fixedSchedules.map(normalizeFixedSchedule);

        if (localTasks.length) {
          const { error } = await supabase
            .from("tasks")
            .upsert(
              localTasks.map((task) =>
                localTaskToSupabase(task, currentUser.id)
              )
            );

          if (error) throw error;
        }

        if (localSchedules.length) {
          const { error } = await supabase
            .from("fixed_schedules")
            .upsert(
              localSchedules.map((schedule) =>
                localScheduleToSupabase(
                  schedule,
                  currentUser.id
                )
              )
            );

          if (error) throw error;
        }

        const localSettings = {
          ...DEFAULT_SETTINGS,
          ...localData.settings,
        };

        const { error: settingsError } = await supabase
          .from("study_settings")
          .upsert({
            user_id: currentUser.id,
            wake_up_time: localSettings.wakeUpTime,
            morning_prep_minutes:
              localSettings.morningPrepMinutes,
            use_study_room: localSettings.useStudyRoom,
            travel_minutes: localSettings.travelMinutes,
            study_start: localSettings.studyStart,
            study_end: localSettings.studyEnd,
            default_task_minutes:
              localSettings.defaultTaskMinutes,
            updated_at: new Date().toISOString(),
          });

        if (settingsError) throw settingsError;

        setTasks(localTasks);
        setFixedSchedules(localSchedules);
        setSettings(localSettings);
        setSettingsDraft(localSettings);

        setSyncMessage(
          "これまでのデータをSupabaseへ移行しました。"
        );
      } else {
        setTasks(remoteTasks);
        setFixedSchedules(remoteSchedules);

        const finalSettings =
          remoteSettings || DEFAULT_SETTINGS;

        setSettings(finalSettings);
        setSettingsDraft(finalSettings);

        saveLocalData({
          tasks: remoteTasks,
          fixedSchedules: remoteSchedules,
          settings: finalSettings,
        });
      }
    } catch (err) {
      console.error(err);
      setSyncMessage(
        `Supabaseの読み込みに失敗しました: ${
          err.message || "Unknown error"
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

  /*
  ----------------------------------------
  Task
  ----------------------------------------
  */

  async function addTask() {
    if (!newTask.title.trim()) {
      alert("タスク名を入力してください。");
      return;
    }

    const task = normalizeTask({
      ...newTask,
      taskDate: selectedDate,
      completed: false,
      studiedMinutes: 0,
    });

    setTasks((prev) => [...prev, task]);

    const { error } = await supabase
      .from("tasks")
      .insert(localTaskToSupabase(task, user.id));

    if (error) {
      console.error(error);
      alert(`保存に失敗しました: ${error.message}`);
      setTasks((prev) =>
        prev.filter((item) => item.id !== task.id)
      );
      return;
    }

    setNewTask({
      subject: "数学",
      title: "",
      minutes: 45,
      priority: 3,
    });
  }

  async function toggleTask(task) {
    const updated = {
      ...task,
      completed: !task.completed,
    };

    setTasks((prev) =>
      prev.map((item) =>
        item.id === task.id ? updated : item
      )
    );

    const { error } = await supabase
      .from("tasks")
      .update({
        completed: updated.completed,
      })
      .eq("id", task.id)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
    }
  }

  async function deleteTask(taskId) {
    setTasks((prev) =>
      prev.filter((task) => task.id !== taskId)
    );

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
    }
  }

  /*
  ----------------------------------------
  Fixed Schedule
  ----------------------------------------
  */

  async function addSchedule() {
    if (!newSchedule.title.trim()) {
      alert("予定名を入力してください。");
      return;
    }

    if (
      timeToMinutes(newSchedule.endTime) <=
      timeToMinutes(newSchedule.startTime)
    ) {
      alert("終了時刻は開始時刻より後にしてください。");
      return;
    }

    const schedule = normalizeFixedSchedule({
      ...newSchedule,
      scheduleDate: selectedDate,
    });

    setFixedSchedules((prev) => [...prev, schedule]);

    const { error } = await supabase
      .from("fixed_schedules")
      .insert(
        localScheduleToSupabase(schedule, user.id)
      );

    if (error) {
      console.error(error);
      alert(`保存に失敗しました: ${error.message}`);

      setFixedSchedules((prev) =>
        prev.filter((item) => item.id !== schedule.id)
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

  async function deleteSchedule(scheduleId) {
    setFixedSchedules((prev) =>
      prev.filter((item) => item.id !== scheduleId)
    );

    const { error } = await supabase
      .from("fixed_schedules")
      .delete()
      .eq("id", scheduleId)
      .eq("user_id", user.id);

    if (error) {
      console.error(error);
    }
  }

  /*
  ----------------------------------------
  Settings
  ----------------------------------------
  */

  async function saveSettings() {
    const next = {
      ...DEFAULT_SETTINGS,
      ...settingsDraft,
    };

    setSettings(next);

    const { error } = await supabase
      .from("study_settings")
      .upsert({
        user_id: user.id,
        wake_up_time: next.wakeUpTime,
        morning_prep_minutes:
          Number(next.morningPrepMinutes),
        use_study_room: Boolean(next.useStudyRoom),
        travel_minutes: Number(next.travelMinutes),
        study_start: next.studyStart,
        study_end: next.studyEnd,
        default_task_minutes:
          Number(next.defaultTaskMinutes),
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error(error);
      alert(`設定の保存に失敗しました: ${error.message}`);
      return;
    }

    setSyncMessage("設定を保存しました。");
  }

  /*
  ----------------------------------------
  Timer
  ----------------------------------------
  */

  useEffect(() => {
    if (!timerRunning) return;

    const interval = setInterval(() => {
      setTimerSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [timerRunning]);

  async function finishTimer() {
    if (!timerTaskId) return;

    const studiedMinutes = Math.max(
      1,
      Math.floor(timerSeconds / 60)
    );

    const target = tasks.find(
      (task) => task.id === timerTaskId
    );

    if (!target) return;

    const updated = {
      ...target,
      studiedMinutes:
        Number(target.studiedMinutes || 0) +
        studiedMinutes,
    };

    setTasks((prev) =>
      prev.map((task) =>
        task.id === target.id ? updated : task
      )
    );

    await supabase
      .from("tasks")
      .update({
        studied_minutes: updated.studiedMinutes,
      })
      .eq("id", target.id)
      .eq("user_id", user.id);

    setTimerSeconds(0);
    setTimerRunning(false);
  }

  /*
  ----------------------------------------
  Plan
  ----------------------------------------
  */

  const planData = useMemo(
    () =>
      generatePlan(
        selectedDate,
        tasks,
        settings,
        fixedSchedules
      ),
    [selectedDate, tasks, settings, fixedSchedules]
  );

  const selectedDateTasks = useMemo(
    () =>
      tasks.filter(
        (task) => task.taskDate === selectedDate
      ),
    [tasks, selectedDate]
  );

  const selectedDateSchedules = useMemo(
    () =>
      fixedSchedules
        .filter((schedule) =>
          scheduleAppliesToDate(schedule, selectedDate)
        )
        .sort(
          (a, b) =>
            timeToMinutes(a.startTime) -
            timeToMinutes(b.startTime)
        ),
    [fixedSchedules, selectedDate]
  );

  /*
  ----------------------------------------
  Progress
  ----------------------------------------
  */

  const totalTaskMinutes = tasks.reduce(
    (sum, task) => sum + Number(task.minutes || 0),
    0
  );

  const totalStudiedMinutes = tasks.reduce(
    (sum, task) =>
      sum + Number(task.studiedMinutes || 0),
    0
  );

  const completedTasks = tasks.filter(
    (task) => task.completed
  ).length;

  const studyDays = new Set(
    tasks
      .filter(
        (task) => Number(task.studiedMinutes || 0) > 0
      )
      .map((task) => task.taskDate)
  );

  const calendarDays = useMemo(() => {
    const first = getMonthStart(calendarMonth);
    const [year, month] = first.split("-").map(Number);

    const firstDay = new Date(
      year,
      month - 1,
      1
    ).getDay();

    const days = getDaysInMonth(first);

    const result = [];

    for (let i = 0; i < firstDay; i++) {
      result.push(null);
    }

    for (let i = 1; i <= days; i++) {
      result.push(
        `${year}-${String(month).padStart(2, "0")}-${String(
          i
        ).padStart(2, "0")}`
      );
    }

    return result;
  }, [calendarMonth]);

  /*
  ----------------------------------------
  Logout
  ----------------------------------------
  */

  async function logout() {
    await supabase.auth.signOut();

    setTasks([]);
    setFixedSchedules([]);
    setSettings(DEFAULT_SETTINGS);
  }

  /*
  ----------------------------------------
  Loading
  ----------------------------------------
  */

  if (authLoading) {
    return (
      <div className="app">
        <main className="container">
          <div className="card">
            <h2>StudyFlow</h2>
            <p>読み込み中...</p>
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={(currentUser) =>
          setUser(currentUser)
        }
      />
    );
  }

  /*
  ========================================
  Main UI
  ========================================
  */

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>StudyFlow</h1>
          <p>あなたの勉強時間を自動で整理</p>
        </div>

        <div className="header-actions">
          <span>
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
          className={activeTab === "today" ? "active" : ""}
          onClick={() => setActiveTab("today")}
        >
          今日
        </button>

        <button
          className={activeTab === "plan" ? "active" : ""}
          onClick={() => setActiveTab("plan")}
        >
          自動計画
        </button>

        <button
          className={activeTab === "calendar" ? "active" : ""}
          onClick={() => setActiveTab("calendar")}
        >
          カレンダー
        </button>

        <button
          className={activeTab === "progress" ? "active" : ""}
          onClick={() => setActiveTab("progress")}
        >
          進捗
        </button>

        <button
          className={activeTab === "settings" ? "active" : ""}
          onClick={() => setActiveTab("settings")}
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

        <section className="date-control card">
          <div>
            <strong>対象日</strong>
            <div className="date-row">
              <button
                onClick={() =>
                  setSelectedDate(
                    addDays(selectedDate, -1)
                  )
                }
              >
                ←
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={(e) =>
                  setSelectedDate(e.target.value)
                }
              />

              <button
                onClick={() =>
                  setSelectedDate(
                    addDays(selectedDate, 1)
                  )
                }
              >
                →
              </button>

              <button
                onClick={() =>
                  setSelectedDate(todayString())
                }
              >
                今日
              </button>
            </div>
          </div>
        </section>

        {activeTab === "today" && (
          <>
            <section className="grid">
              <div className="card">
                <h2>今日の学習</h2>

                <p>
                  {formatDateJP(selectedDate)}
                </p>

                <div className="stat">
                  <strong>
                    {planData.totalAvailable}
                  </strong>
                  <span>分 学習可能</span>
                </div>

                <div className="stat">
                  <strong>
                    {planData.totalRequired}
                  </strong>
                  <span>分 必要</span>
                </div>

                {planData.shortage > 0 && (
                  <p className="warning">
                    学習時間が約{" "}
                    {planData.shortage}分不足しています。
                  </p>
                )}

                {planData.shortage === 0 && (
                  <p className="success">
                    必要な学習時間を確保できます。
                  </p>
                )}
              </div>

              <div className="card">
                <h2>タイマー</h2>

                <select
                  value={timerTaskId}
                  onChange={(e) =>
                    setTimerTaskId(e.target.value)
                  }
                >
                  <option value="">
                    タスクを選択
                  </option>

                  {selectedDateTasks.map((task) => (
                    <option
                      key={task.id}
                      value={task.id}
                    >
                      {task.subject}：{task.title}
                    </option>
                  ))}
                </select>

                <div className="timer">
                  {String(
                    Math.floor(timerSeconds / 60)
                  ).padStart(2, "0")}
                  :
                  {String(timerSeconds % 60).padStart(
                    2,
                    "0"
                  )}
                </div>

                <div className="button-row">
                  <button
                    disabled={!timerTaskId}
                    onClick={() =>
                      setTimerRunning((prev) => !prev)
                    }
                  >
                    {timerRunning
                      ? "一時停止"
                      : "開始"}
                  </button>

                  <button
                    className="secondary-button"
                    disabled={!timerTaskId}
                    onClick={finishTimer}
                  >
                    学習終了
                  </button>
                </div>
              </div>
            </section>

            <section className="card">
              <h2>タスク追加</h2>

              <div className="form-grid">
                <label>
                  科目
                  <input
                    value={newTask.subject}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        subject: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  タスク
                  <input
                    value={newTask.title}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        title: e.target.value,
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
                    value={newTask.minutes}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        minutes: Number(e.target.value),
                      })
                    }
                  />
                </label>

                <label>
                  優先度
                  <select
                    value={newTask.priority}
                    onChange={(e) =>
                      setNewTask({
                        ...newTask,
                        priority: Number(
                          e.target.value
                        ),
                      })
                    }
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </label>
              </div>

              <button onClick={addTask}>
                タスクを追加
              </button>
            </section>

            <section className="card">
              <h2>固定予定</h2>

              {selectedDateSchedules.length === 0 ? (
                <p>固定予定はありません。</p>
              ) : (
                selectedDateSchedules.map((schedule) => (
                  <div
                    className="list-item"
                    key={schedule.id}
                  >
                    <div>
                      <strong>
                        {schedule.startTime}〜
                        {schedule.endTime}
                      </strong>
                      <br />
                      {schedule.title}　
                      {FIXED_CATEGORIES[
                        schedule.category
                      ] || "その他"}
                    </div>

                    <button
                      className="danger-button"
                      onClick={() =>
                        deleteSchedule(schedule.id)
                      }
                    >
                      削除
                    </button>
                  </div>
                ))
              )}

              <hr />

              <div className="form-grid">
                <label>
                  予定名
                  <input
                    value={newSchedule.title}
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        title: e.target.value,
                      })
                    }
                    placeholder="例：学校"
                  />
                </label>

                <label>
                  種類
                  <select
                    value={newSchedule.category}
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        category: e.target.value,
                      })
                    }
                  >
                    {Object.entries(
                      FIXED_CATEGORIES
                    ).map(([key, value]) => (
                      <option key={key} value={key}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  開始
                  <input
                    type="time"
                    value={newSchedule.startTime}
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        startTime: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  終了
                  <input
                    type="time"
                    value={newSchedule.endTime}
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        endTime: e.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  繰り返し
                  <select
                    value={newSchedule.repeatType}
                    onChange={(e) =>
                      setNewSchedule({
                        ...newSchedule,
                        repeatType: e.target.value,
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

              <button onClick={addSchedule}>
                予定を追加
              </button>
            </section>

            <section className="card">
              <h2>タスク一覧</h2>

              {selectedDateTasks.length === 0 ? (
                <p>タスクはありません。</p>
              ) : (
                selectedDateTasks.map((task) => (
                  <div
                    className="list-item"
                    key={task.id}
                  >
                    <div>
                      <strong>
                        {task.subject}
                      </strong>{" "}
                      {task.title}
                      <br />
                      <small>
                        {task.studiedMinutes || 0} /{" "}
                        {task.minutes}分　
                        優先度 {task.priority}
                      </small>
                    </div>

                    <div className="button-row">
                      <button
                        onClick={() =>
                          toggleTask(task)
                        }
                      >
                        {task.completed
                          ? "完了済み"
                          : "完了"}
                      </button>

                      <button
                        className="danger-button"
                        onClick={() =>
                          deleteTask(task.id)
                        }
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {activeTab === "plan" && (
          <section className="card">
            <h2>自動学習計画</h2>

            <p>
              固定予定と勉強可能時間を考慮して、
              優先度の高いタスクから自動配置します。
            </p>

            <div className="grid">
              <div className="stat">
                <strong>
                  {planData.totalAvailable}
                </strong>
                <span>分 学習可能</span>
              </div>

              <div className="stat">
                <strong>
                  {planData.totalRequired}
                </strong>
                <span>分 必要</span>
              </div>

              <div className="stat">
                <strong>
                  {planData.plan.reduce(
                    (sum, item) =>
                      sum + item.minutes,
                    0
                  )}
                </strong>
                <span>分 自動配置</span>
              </div>
            </div>

            {planData.plan.length === 0 ? (
              <p>
                現在、自動配置できるタスクがありません。
              </p>
            ) : (
              <div className="plan-list">
                {planData.plan.map((item, index) => (
                  <div
                    className="plan-item"
                    key={`${item.taskId}-${index}`}
                  >
                    <strong>
                      {item.start}〜{item.end}
                    </strong>

                    <span>
                      {item.subject}：{item.title}
                    </span>

                    <small>
                      {item.minutes}分
                    </small>
                  </div>
                ))}
              </div>
            )}

            {planData.shortage > 0 && (
              <div className="warning-box">
                <strong>
                  学習時間が不足しています
                </strong>
                <p>
                  あと {planData.shortage}分
                  必要です。
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === "calendar" && (
          <section className="card">
            <div className="calendar-header">
              <button
                onClick={() =>
                  setCalendarMonth(
                    addDays(
                      `${calendarMonth.slice(0, 7)}-01`,
                      -1
                    )
                  )
                }
              >
                ←
              </button>

              <h2>
                {calendarMonth.slice(0, 7)}
              </h2>

              <button
                onClick={() =>
                  setCalendarMonth(
                    addDays(
                      `${calendarMonth.slice(0, 7)}-01`,
                      32
                    )
                  }
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
              ].map((day) => (
                <div
                  className="calendar-weekday"
                  key={day}
                >
                  {day}
                </div>
              ))}

              {calendarDays.map((date, index) => {
                if (!date) {
                  return (
                    <div
                      className="calendar-empty"
                      key={`empty-${index}`}
                    />
                  );
                }

                const dateTasks = tasks.filter(
                  (task) =>
                    task.taskDate === date
                );

                const totalMinutes =
                  dateTasks.reduce(
                    (sum, task) =>
                      sum +
                      Number(
                        task.studiedMinutes || 0
                      ),
                    0
                  );

                return (
                  <button
                    className={`calendar-day ${
                      date === selectedDate
                        ? "selected"
                        : ""
                    }`}
                    key={date}
                    onClick={() =>
                      setSelectedDate(date)
                    }
                  >
                    <strong>
                      {Number(date.slice(8))}
                    </strong>

                    {totalMinutes > 0 && (
                      <small>
                        {totalMinutes}分
                      </small>
                    )}

                    {dateTasks.length > 0 && (
                      <small>
                        {dateTasks.length}件
                      </small>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {activeTab === "progress" && (
          <>
            <section className="grid">
              <div className="card">
                <h2>総学習時間</h2>
                <div className="big-number">
                  {totalStudiedMinutes}
                </div>
                <p>分</p>
              </div>

              <div className="card">
                <h2>学習日数</h2>
                <div className="big-number">
                  {studyDays.size}
                </div>
                <p>日</p>
              </div>

              <div className="card">
                <h2>完了タスク</h2>
                <div className="big-number">
                  {completedTasks}
                </div>
                <p>
                  / {tasks.length}件
                </p>
              </div>
            </section>

            <section className="card">
              <h2>科目別学習量</h2>

              {Array.from(
                new Set(tasks.map((task) => task.subject))
              ).map((subject) => {
                const minutes = tasks
                  .filter(
                    (task) =>
                      task.subject === subject
                  )
                  .reduce(
                    (sum, task) =>
                      sum +
                      Number(
                        task.studiedMinutes || 0
                      ),
                    0
                  );

                return (
                  <div
                    className="progress-row"
                    key={subject}
                  >
                    <span>{subject}</span>

                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${
                            totalStudiedMinutes > 0
                              ? Math.min(
                                  100,
                                  (minutes /
                                    totalStudiedMinutes) *
                                    100
                                )
                              : 0
                          }%`,
                        }}
                      />
                    </div>

                    <strong>
                      {minutes}分
                    </strong>
                  </div>
                );
              })}
            </section>
          </>
        )}

        {activeTab === "settings" && (
          <section className="card">
            <h2>学習設定</h2>

            <div className="form-grid">
              <label>
                起床時刻
                <input
                  type="time"
                  value={settingsDraft.wakeUpTime}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      wakeUpTime: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                朝の支度時間
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
                        Number(e.target.value),
                    })
                  }
                />
              </label>

              <label>
                学習開始時刻
                <input
                  type="time"
                  value={settingsDraft.studyStart}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      studyStart: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                学習終了時刻
                <input
                  type="time"
                  value={settingsDraft.studyEnd}
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      studyEnd: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                デフォルトタスク時間
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
                        Number(e.target.value),
                    })
                  }
                />
              </label>

              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={
                    settingsDraft.useStudyRoom
                  }
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      useStudyRoom:
                        e.target.checked,
                    })
                  }
                />
                自習室を利用する
              </label>

              <label>
                自習室までの移動時間
                <input
                  type="number"
                  min="0"
                  value={
                    settingsDraft.travelMinutes
                  }
                  onChange={(e) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      travelMinutes:
                        Number(e.target.value),
                    })
                  }
                />
              </label>
            </div>

            <button onClick={saveSettings}>
              設定を保存
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
