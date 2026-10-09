import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { createRoot } from "react-dom/client";
import { supabase } from "./supabase";
import AIPlanPanel from "./AIPlanPanel";
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

const WEEKDAYS = [
  { value: 1, label: "月曜日" },
  { value: 2, label: "火曜日" },
  { value: 3, label: "水曜日" },
  { value: 4, label: "木曜日" },
  { value: 5, label: "金曜日" },
  { value: 6, label: "土曜日" },
  { value: 0, label: "日曜日" },
];

function createDefaultWeekdaySettings(base = DEFAULT_SETTINGS) {
  return Object.fromEntries(WEEKDAYS.map((day) => [String(day.value), {
    studyStart: base.studyStart || DEFAULT_SETTINGS.studyStart,
    studyEnd: base.studyEnd || DEFAULT_SETTINGS.studyEnd,
    schedules: [],
  }]));
}

function getWeekdaySettings(dateString, settings) {
  const day = new Date(`${dateString}T12:00:00`).getDay();
  const base = settings?.weekdaySettings?.[String(day)] || {};
  return {
    studyStart: base.studyStart || settings?.studyStart || DEFAULT_SETTINGS.studyStart,
    studyEnd: base.studyEnd || settings?.studyEnd || DEFAULT_SETTINGS.studyEnd,
    schedules: Array.isArray(base.schedules) ? base.schedules : [],
  };
}

function settingsForPlanningWindow(settings, dateString, window) {
  const day = String(new Date(`${dateString}T12:00:00`).getDay());
  const normalized = normalizeSettings(settings);
  return normalizeSettings({
    ...normalized,
    weekdaySettings: {
      ...normalized.weekdaySettings,
      [day]: {
        ...normalized.weekdaySettings[day],
        studyStart: window.start,
        studyEnd: window.end,
      },
    },
  });
}

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
  return {
    ...DEFAULT_SETTINGS,
    ...(settings || {}),
    morningPrepMinutes: Math.max(
      0,
      Number(settings?.morningPrepMinutes) ||
        DEFAULT_SETTINGS.morningPrepMinutes
    ),
    travelMinutes: Math.max(
      0,
      Number(settings?.travelMinutes) ||
        DEFAULT_SETTINGS.travelMinutes
    ),
    defaultTaskMinutes: Math.max(
      1,
      Number(settings?.defaultTaskMinutes) ||
        DEFAULT_SETTINGS.defaultTaskMinutes
    ),
    weekdaySettings: {
      ...createDefaultWeekdaySettings({
        studyStart: settings?.studyStart || DEFAULT_SETTINGS.studyStart,
        studyEnd: settings?.studyEnd || DEFAULT_SETTINGS.studyEnd,
      }),
      ...(settings?.weekdaySettings || {}),
    },
  };
}

function scheduleAppliesToDate(schedule, dateString) {
  if (schedule.repeat_type === "daily") return true;
  if (schedule.repeat_type === "weekly") {
    return Number(schedule.weekday) === new Date(`${dateString}T12:00:00`).getDay();
  }
  return schedule.schedule_date === dateString;
}

function getSchedulesForDate(dateString, settings, fixedSchedules) {
  const daySettings = getWeekdaySettings(dateString, settings);
  const weekly = daySettings.schedules.map((item, index) => ({
    ...item,
    id: item.id || `weekday-${new Date(`${dateString}T12:00:00`).getDay()}-${index}`,
    repeat_type: "today",
    schedule_date: dateString,
  }));
  return [...(fixedSchedules || []).filter((s) => scheduleAppliesToDate(s, dateString)), ...weekly];
}

function getBlockedIntervals(dateString, settings, fixedSchedules) {
  const blocked = [];

  const weekdaySettings = getWeekdaySettings(dateString, settings);
  const studyStart = timeToMinutes(weekdaySettings.studyStart);
  const studyEnd = timeToMinutes(weekdaySettings.studyEnd);
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

  getSchedulesForDate(dateString, settings, fixedSchedules)
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
  const weekdaySettings = getWeekdaySettings(dateString, settings);
  const studyStart = timeToMinutes(weekdaySettings.studyStart);
  const studyEnd = timeToMinutes(weekdaySettings.studyEnd);

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
  eligibleTaskIds = null,
  maxSubjectsPerDay = 3,
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

  /*
   集中型プランニング

   1日の科目数を絞り、同じ科目をある程度まとまった時間で進める。
   既存のタスク構造・固定予定・勉強可能時間はそのまま利用する。

   ・基本は最大3科目/日
   ・1科目あたり最大90分を1ブロックの目安にする
   ・同じ科目が複数ブロックにまたがることを許可
   ・優先度 → 残り時間の順で、その日の中心科目を決める
   ・選んだ科目を終えたら、次の科目を補充する
  */
  const MAX_SUBJECTS_PER_DAY = Math.max(1, Number(maxSubjectsPerDay) || 3);
  const TARGET_BLOCK_MINUTES = 90;

  const targets = tasks
    .filter(
      (task) =>
        (eligibleTaskIds === null
          ? task.task_date === dateString
          : eligibleTaskIds.includes(task.id)) &&
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
    .filter((task) => task.remaining > 0);

  /* 科目単位にまとめる */
  const subjectMap = new Map();

  for (const task of targets) {
    if (!subjectMap.has(task.subject)) {
      subjectMap.set(task.subject, {
        subject: task.subject,
        priority: 0,
        remaining: 0,
        tasks: [],
      });
    }

    const group = subjectMap.get(task.subject);

    group.priority = Math.max(
      group.priority,
      Number(task.priority || 1)
    );
    group.remaining += task.remaining;
    group.tasks.push({ ...task });
  }

  const subjects = [...subjectMap.values()].sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }

    return b.remaining - a.remaining;
  });

  const plan = [];
  const plannedBySubject = new Map();

  let slotIndex = 0;
  let cursor = slots.length > 0 ? slots[0].start : 0;
  let subjectIndex = 0;
  let currentSubject = null;

  const getActiveSubjects = () => {
    const active = [];

    for (const subject of subjects) {
      const planned = plannedBySubject.get(subject.subject) || 0;

      if (planned < subject.remaining) {
        active.push(subject);
      }

      if (active.length >= MAX_SUBJECTS_PER_DAY) {
        break;
      }
    }

    return active;
  };

  let activeSubjects = getActiveSubjects();

  /*
   最初の最大3科目を中心に進める。
   1科目を90分単位でまとめ、次の科目へ移る。
   90分を使い切ったら次の科目へ、3科目を一周したら再び先頭へ戻る。
  */
  while (
    slotIndex < slots.length &&
    activeSubjects.length > 0
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

    if (!currentSubject || !activeSubjects.some((x) => x.subject === currentSubject.subject)) {
      activeSubjects = getActiveSubjects();

      if (activeSubjects.length === 0) {
        break;
      }

      currentSubject = activeSubjects[subjectIndex % activeSubjects.length];
    }

    const subject = currentSubject;
    const plannedForSubject = plannedBySubject.get(subject.subject) || 0;
    const remainingForSubject = Math.max(
      0,
      subject.remaining - plannedForSubject
    );

    if (remainingForSubject <= 0) {
      activeSubjects = getActiveSubjects();

      if (activeSubjects.length === 0) {
        break;
      }

      subjectIndex = (subjectIndex + 1) % activeSubjects.length;
      currentSubject = activeSubjects[subjectIndex];
      continue;
    }

    const currentBlockProgress =
      plannedForSubject % TARGET_BLOCK_MINUTES;
    const blockRemaining =
      currentBlockProgress === 0
        ? TARGET_BLOCK_MINUTES
        : TARGET_BLOCK_MINUTES - currentBlockProgress;

    const amount = Math.min(
      remainingForSubject,
      availableHere,
      blockRemaining
    );

    if (amount <= 0) {
      break;
    }

    subject.tasks.sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }
      return b.remaining - a.remaining;
    });

    let remainingAmount = amount;

    for (const task of subject.tasks) {
      if (remainingAmount <= 0) break;

      const alreadyPlanned = task._planned || 0;
      const taskRemaining = Math.max(
        0,
        task.remaining - alreadyPlanned
      );

      if (taskRemaining <= 0) continue;

      const taskAmount = Math.min(
        remainingAmount,
        taskRemaining
      );

      plan.push({
        id: createId(),
        taskId: task.id,
        title: task.title,
        subject: task.subject,
        priority: task.priority,
        start: cursor,
        end: cursor + taskAmount,
        minutes: taskAmount,
      });

      task._planned = alreadyPlanned + taskAmount;
      remainingAmount -= taskAmount;
      cursor += taskAmount;

      const currentPlanned =
        plannedBySubject.get(subject.subject) || 0;
      plannedBySubject.set(
        subject.subject,
        currentPlanned + taskAmount
      );
    }

    const updatedPlanned =
      plannedBySubject.get(subject.subject) || 0;
    const subjectFinished = updatedPlanned >= subject.remaining;
    const blockFinished =
      updatedPlanned % TARGET_BLOCK_MINUTES === 0 ||
      subjectFinished;

    if (cursor >= slot.end) {
      slotIndex += 1;
      if (slots[slotIndex]) {
        cursor = slots[slotIndex].start;
      }
    }

    if (blockFinished || subjectFinished) {
      activeSubjects = getActiveSubjects();

      if (activeSubjects.length === 0) {
        break;
      }

      const currentIndex = activeSubjects.findIndex(
        (x) => x.subject === subject.subject
      );

      subjectIndex =
        currentIndex >= 0
          ? (currentIndex + 1) % activeSubjects.length
          : 0;

      currentSubject = activeSubjects[subjectIndex];
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
  const [savedPlanItems, setSavedPlanItems] = useState([]);

  const [settings, setSettings] = useState(
    DEFAULT_SETTINGS
  );

  const [profile, setProfile] = useState({
    nickname: "",
  });

  const [studyLogs, setStudyLogs] = useState([]);

  const [loadingData, setLoadingData] = useState(false);

  const [activeTab, setActiveTab] = useState("today");

  const [planningStep, setPlanningStep] = useState(1);
  const [planningMode, setPlanningMode] = useState("standard");
  const [planningTaskIds, setPlanningTaskIds] = useState([]);
  const [planningRecommendedIds, setPlanningRecommendedIds] = useState([]);
  const [planningEdits, setPlanningEdits] = useState({});
  const [planningWindow, setPlanningWindow] = useState({
    start: DEFAULT_SETTINGS.studyStart,
    end: DEFAULT_SETTINGS.studyEnd,
  });

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
  終わらせたい教材フォーム
  */

  const [goalForm, setGoalForm] = useState({
    title: "",
    subject: "数学",
    total_pages: 100,
    current_page: 0,
    deadline: addDays(todayString(), 14),
    minutes_per_page: 4,
    priority: 3,
  });

  const [editingGoalId, setEditingGoalId] = useState(null);

  /*
   学習進捗の手動記録
  */
  const [progressGoalId, setProgressGoalId] = useState("");
  const [progressEndPage, setProgressEndPage] = useState("");

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
  手動学習時間記録
  */

  const [manualRecordDate, setManualRecordDate] =
    useState(todayString());

  const [manualRecordMinutes, setManualRecordMinutes] =
    useState(30);

  const [manualRecordSubject, setManualRecordSubject] =
    useState("その他");

  const [manualRecordTaskId, setManualRecordTaskId] =
    useState("");

  /*
  設定編集
  */

  const [settingsForm, setSettingsForm] =
    useState(normalizeSettings(DEFAULT_SETTINGS));
  const [weekdayEditorDay, setWeekdayEditorDay] = useState(1);
  const [weekdayScheduleDraft, setWeekdayScheduleDraft] = useState({
    title: "学校",
    category: "school",
    start_time: "08:30",
    end_time: "15:30",
  });

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
        settingsResult,
        profileResult,
        logsResult,
        goalsResult,
        planItemsResult,
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

        supabase
          .from("study_goals")
          .select("*")
          .eq("user_id", userId)
          .order("deadline", { ascending: true })
          .order("priority", { ascending: false }),

        supabase
          .from("study_plan_items")
          .select("*")
          .eq("user_id", userId)
          .order("plan_date", { ascending: true })
          .order("start_time", { ascending: true }),
      ]);

      if (tasksResult.error) {
        console.error(tasksResult.error);
      }

      if (fixedResult.error) {
        console.error(fixedResult.error);
      }

      if (settingsResult.error) {
        console.error(settingsResult.error);
      }

      if (profileResult.error) {
        console.error(profileResult.error);
      }

      if (logsResult.error) {
        console.error(logsResult.error);
      }

      if (goalsResult.error) {
        console.error("study_goals読み込みエラー:", goalsResult.error);
      }
      if (planItemsResult.error) {
        console.error("study_plan_items読み込みエラー:", planItemsResult.error);
      }

      const local = getLocalData();

      const remoteTasks =
        tasksResult.data?.map((task) =>
          normalizeTask(task, userId)
        ) || [];

      const remoteFixed =
        fixedResult.data?.map((schedule) =>
          normalizeFixedSchedule(schedule, userId)
        ) || [];

      const remoteSettings = normalizeSettings(
        settingsResult.data
      );

      /*
       初回ログイン時
       */

      if (
        remoteTasks.length === 0 &&
        remoteFixed.length === 0 &&
        !settingsResult.data &&
        local?.tasks?.length
      ) {
        const localTasks = local.tasks.map((task) =>
          normalizeTask(task, userId)
        );

        const localFixed =
          local.fixedSchedules?.map((schedule) =>
            normalizeFixedSchedule(
              schedule,
              userId
            )
          ) || [];

        const localSettings = normalizeSettings(
          local.settings
        );

        await supabase.from("tasks").insert(
          localTasks.map((task) => ({
            id: task.id,
            user_id: userId,
            subject: task.subject,
            title: task.title,
            minutes: task.minutes,
            priority: task.priority,
            task_date: task.task_date,
            completed: task.completed,
            studied_minutes: task.studied_minutes,
          }))
        );

        if (localFixed.length) {
          await supabase
            .from("fixed_schedules")
            .insert(
              localFixed.map((schedule) => ({
                id: schedule.id,
                user_id: userId,
                title: schedule.title,
                category: schedule.category,
                start_time:
                  schedule.start_time,
                end_time: schedule.end_time,
                repeat_type:
                  schedule.repeat_type,
                schedule_date:
                  schedule.schedule_date,
              }))
            );
        }

        await supabase
          .from("study_settings")
          .upsert({
            user_id: userId,
            wake_up_time:
              localSettings.wakeUpTime,
            morning_prep_minutes:
              localSettings.morningPrepMinutes,
            use_study_room:
              localSettings.useStudyRoom,
            travel_minutes:
              localSettings.travelMinutes,
            study_start:
              localSettings.studyStart,
            study_end:
              localSettings.studyEnd,
            default_task_minutes:
              localSettings.defaultTaskMinutes,
            weekday_settings: localSettings.weekdaySettings,
          });

        setTasks(localTasks);
        setFixedSchedules(localFixed);
        setSettings(localSettings);
        setSettingsForm(localSettings);
      } else {
        /*
         Supabaseにデータがある場合
        */

        let nextTasks = remoteTasks;
        let nextFixed = remoteFixed;
        let nextSettings = remoteSettings;

        /*
         完全な新規ユーザーなら
         初期タスクを作成
        */

        if (
          remoteTasks.length === 0 &&
          !local?.tasks?.length
        ) {
          const initialTasks =
            DEFAULT_TASKS.map((task) =>
              normalizeTask(
                {
                  ...task,
                  task_date: todayString(),
                },
                userId
              )
            );

          const { data: insertedTasks } =
            await supabase
              .from("tasks")
              .insert(
                initialTasks.map((task) => ({
                  id: task.id,
                  user_id: userId,
                  subject: task.subject,
                  title: task.title,
                  minutes: task.minutes,
                  priority: task.priority,
                  task_date: task.task_date,
                  completed: false,
                  studied_minutes: 0,
                }))
              )
              .select();

          nextTasks =
            insertedTasks?.map((task) =>
              normalizeTask(task, userId)
            ) || initialTasks;
        }

        setTasks(nextTasks);
        setFixedSchedules(nextFixed);
        setSettings(nextSettings);
        setSettingsForm(nextSettings);
      }

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
      setStudyGoals(goalsResult.data || []);
      setSavedPlanItems(planItemsResult.data || []);

      /*
       localStorageにもミラー
      */

      saveLocalData({
        tasks:
          remoteTasks.length > 0
            ? remoteTasks
            : tasks,
        fixedSchedules:
          remoteFixed.length > 0
            ? remoteFixed
            : fixedSchedules,
        settings: remoteSettings,
      });
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
      setStudyLogs([]);
      setStudyGoals([]);
      setSavedPlanItems([]);
    }
  }, [session, loadData]);

  /*
  ================================================
  localStorageミラー
  ================================================
  */

  useEffect(() => {
    if (!session) return;

    saveLocalData({
      tasks,
      fixedSchedules,
      settings,
    });
  }, [
    tasks,
    fixedSchedules,
    settings,
    session,
  ]);

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

    const matchedGoal = studyGoals.find((goal) =>
      String(task.title || "").startsWith(`${goal.title}（P.`)
    );

    if (matchedGoal && session?.user?.id) {
      // 今回の学習セッション分だけをページ進捗へ反映します。
      // 累積 studied_minutes をそのまま足さないことで、二重加算を防ぎます。
      const pagesStudied = Math.floor(
        studiedMinutes / Math.max(0.5, Number(matchedGoal.minutes_per_page || 1))
      );
      const nextPage = Math.min(
        Number(matchedGoal.total_pages || 0),
        Number(matchedGoal.current_page || 0) + pagesStudied
      );
      if (nextPage > Number(matchedGoal.current_page || 0)) {
        const { data: updatedGoal } = await supabase
          .from("study_goals")
          .update({
            current_page: nextPage,
            is_active: nextPage < Number(matchedGoal.total_pages || 0),
            completed_at: nextPage >= Number(matchedGoal.total_pages || 0) ? new Date().toISOString() : null,
          })
          .eq("id", matchedGoal.id)
          .eq("user_id", session.user.id)
          .select()
          .maybeSingle();

        if (updatedGoal) {
          setStudyGoals((current) => current.map((goal) => goal.id === updatedGoal.id ? updatedGoal : goal));
        }
      }
    }

    setTasks((current) =>
      current.map((item) =>
        item.id === task.id
          ? updatedTask
          : item
      )
    );

    if (session?.user?.id) {
      await supabase
        .from("tasks")
        .update({
          studied_minutes: nextStudied,
          completed: nextCompleted,
        })
        .eq("id", task.id)
        .eq("user_id", session.user.id);

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

  const saveManualStudyTime = async (event) => {
    event.preventDefault();

    const minutes = Math.floor(Number(manualRecordMinutes));

    if (!manualRecordDate || !Number.isFinite(minutes) || minutes <= 0) {
      setMessage("記録する日付と1分以上の学習時間を入力してください。");
      return;
    }

    const selectedTask = tasks.find(
      (task) => task.id === manualRecordTaskId
    );

    if (selectedTask) {
      const nextStudied =
        Number(selectedTask.studied_minutes || 0) + minutes;
      const nextCompleted =
        nextStudied >= Number(selectedTask.minutes || 0);

      setTasks((current) =>
        current.map((task) =>
          task.id === selectedTask.id
            ? {
                ...task,
                studied_minutes: nextStudied,
                completed: nextCompleted,
              }
            : task
        )
      );

      if (session?.user?.id) {
        const { error } = await supabase
          .from("tasks")
          .update({
            studied_minutes: nextStudied,
            completed: nextCompleted,
          })
          .eq("id", selectedTask.id)
          .eq("user_id", session.user.id);

        if (error) {
          console.error("手動記録のタスク更新エラー:", error);
          setMessage(`学習時間の保存に失敗しました: ${error.message}`);
          return;
        }
      }
    }

    if (session?.user?.id) {
      const existing = studyLogs.find(
        (log) => log.study_date === manualRecordDate
      );

      const nextMinutes =
        Number(existing?.minutes || 0) + minutes;

      const { data, error } = await supabase
        .from("study_logs")
        .upsert(
          {
            user_id: session.user.id,
            study_date: manualRecordDate,
            minutes: nextMinutes,
          },
          { onConflict: "user_id,study_date" }
        )
        .select()
        .maybeSingle();

      if (error) {
        console.error("手動記録のstudy_logs保存エラー:", error);
        setMessage(`学習時間の保存に失敗しました: ${error.message}`);
        return;
      }

      if (data) {
        setStudyLogs((current) => {
          const exists = current.some(
            (log) => log.study_date === manualRecordDate
          );

          if (exists) {
            return current.map((log) =>
              log.study_date === manualRecordDate ? data : log
            );
          }

          return [...current, data].sort((a, b) =>
            String(a.study_date).localeCompare(String(b.study_date))
          );
        });
      }
    }

    setManualRecordMinutes(30);
    setManualRecordTaskId("");
    setMessage(
      `${formatMinutes(minutes)}の学習時間を${manualRecordDate}に手動で記録しました。`
    );
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
        await supabase
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
        await supabase.from("tasks").insert({
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
      await supabase
        .from("tasks")
        .update({
          completed,
        })
        .eq("id", task.id)
        .eq("user_id", session.user.id);
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

    setTasks((current) =>
      current.filter(
        (task) => task.id !== taskId
      )
    );

    if (session?.user?.id) {
      await supabase
        .from("tasks")
        .delete()
        .eq("id", taskId)
        .eq("user_id", session.user.id);
    }

    if (timerTaskId === taskId) {
      resetTimer();
      setTimerTaskId("");
    }
  };

  /*
  ================================================
  Study goal CRUD
  ================================================
  */

  const resetGoalForm = () => {
    setGoalForm({
      title: "",
      subject: "数学",
      total_pages: 100,
      current_page: 0,
      deadline: addDays(selectedDate, 14),
      minutes_per_page: 4,
      priority: 3,
    });
    setEditingGoalId(null);
  };

  const saveStudyGoal = async (event) => {
    event.preventDefault();
    const title = goalForm.title.trim();
    const totalPages = Math.floor(Number(goalForm.total_pages));
    const currentPage = Math.floor(Number(goalForm.current_page));
    const minutesPerPage = Number(goalForm.minutes_per_page);
    const priority = Math.min(5, Math.max(1, Math.floor(Number(goalForm.priority))));
    if (!title) return setMessage("教材名を入力してください。");
    if (!Number.isFinite(totalPages) || totalPages <= 0) return setMessage("全ページ数を正しく入力してください。");
    if (!Number.isFinite(currentPage) || currentPage < 0 || currentPage > totalPages) return setMessage("現在ページは0〜全ページ数の範囲で入力してください。");
    if (!goalForm.deadline) return setMessage("期限を入力してください。");
    if (!Number.isFinite(minutesPerPage) || minutesPerPage <= 0) return setMessage("1ページあたりの時間を正しく入力してください。");
    const payload = { user_id: session.user.id, title, subject: goalForm.subject, total_pages: totalPages, current_page: currentPage, deadline: goalForm.deadline, minutes_per_page: minutesPerPage, priority, is_active: currentPage < totalPages, completed_at: currentPage >= totalPages ? new Date().toISOString() : null };
    if (editingGoalId) {
      const { data, error } = await supabase.from("study_goals").update(payload).eq("id", editingGoalId).eq("user_id", session.user.id).select().single();
      if (error) return setMessage(`教材の更新に失敗しました: ${error.message}`);
      setStudyGoals((current) => current.map((goal) => goal.id === editingGoalId ? data : goal));
      setMessage("教材の登録内容を更新しました。");
    } else {
      const { data, error } = await supabase.from("study_goals").insert(payload).select().single();
      if (error) return setMessage(`教材の登録に失敗しました: ${error.message}`);
      setStudyGoals((current) => [...current, data].sort((a, b) => String(a.deadline).localeCompare(String(b.deadline))));
      setMessage("終わらせたい教材を登録しました。自動計画の提案に反映されます。");
    }
    resetGoalForm();
  };

  const deleteStudyGoal = async (goalId) => {
    if (!window.confirm("この教材の登録を削除しますか？")) return;
    const { error } = await supabase.from("study_goals").delete().eq("id", goalId).eq("user_id", session.user.id);
    if (error) return setMessage(`教材の削除に失敗しました: ${error.message}`);
    setStudyGoals((current) => current.filter((goal) => goal.id !== goalId));
    setMessage("教材を削除しました。");
  };

  const editStudyGoal = (goal) => {
    setEditingGoalId(goal.id);
    setGoalForm({ title: goal.title || "", subject: goal.subject || "その他", total_pages: goal.total_pages || 1, current_page: goal.current_page || 0, deadline: goal.deadline || selectedDate, minutes_per_page: goal.minutes_per_page || 4, priority: goal.priority || 3 });
    setActiveTab("goals");
  };

  const startProgressRecord = (goal) => {
    setProgressGoalId(goal.id);
    setProgressEndPage(goal.current_page || 0);
  };

  const saveProgressRecord = async (goal) => {
    const endPage = Math.floor(Number(progressEndPage));
    const currentPage = Number(goal.current_page || 0);
    const totalPages = Number(goal.total_pages || 0);

    if (!Number.isFinite(endPage) || endPage < currentPage || endPage > totalPages) {
      setMessage(`終了ページはP.${currentPage}〜P.${totalPages}の範囲で入力してください。`);
      return;
    }

    const updated = {
      current_page: endPage,
      is_active: endPage < totalPages,
      completed_at: endPage >= totalPages ? new Date().toISOString() : null,
    };

    const { data, error } = await supabase
      .from("study_goals")
      .update(updated)
      .eq("id", goal.id)
      .eq("user_id", session.user.id)
      .select()
      .single();

    if (error) {
      setMessage(`進捗の保存に失敗しました: ${error.message}`);
      return;
    }

    const addedPages = Math.max(0, endPage - currentPage);
    setStudyGoals((current) =>
      current.map((item) => item.id === goal.id ? data : item)
    );
    setProgressGoalId("");
    setProgressEndPage("");
    setMessage(
      addedPages > 0
        ? `${goal.title}：P.${currentPage + 1}〜P.${endPage}を記録しました。現在P.${endPage}です。`
        : `${goal.title}：進捗をP.${endPage}に更新しました。`
    );
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

const updateWeekdaySetting = (dayValue, patch) => {
  setSettingsForm((current) => {
    const normalized = normalizeSettings(current);
    const key = String(dayValue);
    return {
      ...normalized,
      weekdaySettings: {
        ...normalized.weekdaySettings,
        [key]: { ...normalized.weekdaySettings[key], ...patch },
      },
    };
  });
};

const addWeekdaySchedule = () => {
  const start = timeToMinutes(weekdayScheduleDraft.start_time);
  const end = timeToMinutes(weekdayScheduleDraft.end_time);
  if (!weekdayScheduleDraft.title.trim() || end <= start) {
    setMessage("予定名と、開始時刻より後の終了時刻を入力してください。");
    return;
  }
  const currentDay = normalizeSettings(settingsForm).weekdaySettings[String(weekdayEditorDay)];
  updateWeekdaySetting(weekdayEditorDay, {
    schedules: [...(currentDay.schedules || []), { ...weekdayScheduleDraft, id: createId(), title: weekdayScheduleDraft.title.trim() }],
  });
  setMessage("曜日の予定を追加しました。最後に「設定を保存」を押してください。");
};

const deleteWeekdaySchedule = (scheduleId) => {
  const currentDay = normalizeSettings(settingsForm).weekdaySettings[String(weekdayEditorDay)];
  updateWeekdaySetting(weekdayEditorDay, {
    schedules: (currentDay.schedules || []).filter((item) => item.id !== scheduleId),
  });
};

const saveSettings = async (event) => {
  event.preventDefault();

  const start = timeToMinutes(settingsForm.studyStart);
  const end = timeToMinutes(settingsForm.studyEnd);

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    setMessage(
      "勉強終了時刻は開始時刻より後にしてください。"
    );
    return;
  }

  const nextSettings = normalizeSettings(settingsForm);
  for (const day of WEEKDAYS) {
    const daySettings = nextSettings.weekdaySettings[String(day.value)];
    if (timeToMinutes(daySettings.studyEnd) <= timeToMinutes(daySettings.studyStart)) {
      setMessage(`${day.label}の勉強終了時刻は開始時刻より後にしてください。`);
      return;
    }
    for (const schedule of daySettings.schedules || []) {
      if (timeToMinutes(schedule.end_time) <= timeToMinutes(schedule.start_time)) {
        setMessage(`${day.label}の「${schedule.title}」の終了時刻を確認してください。`);
        return;
      }
    }
  }

  setSettings(nextSettings);

  if (session?.user?.id) {
    const payload = {
      user_id: session.user.id,
      wake_up_time: nextSettings.wakeUpTime,
      morning_prep_minutes: Number(
        nextSettings.morningPrepMinutes
      ),
      use_study_room: Boolean(
        nextSettings.useStudyRoom
      ),
      travel_minutes: Number(
        nextSettings.travelMinutes
      ),
      study_start: nextSettings.studyStart,
      study_end: nextSettings.studyEnd,
      default_task_minutes: Number(
        nextSettings.defaultTaskMinutes
      ),
      weekday_settings: nextSettings.weekdaySettings,
    };

    const { error } = await supabase
      .from("study_settings")
      .upsert(payload, {
        onConflict: "user_id",
      });

    if (error) {
      console.error(
        "study_settings 保存エラー:",
        error
      );

      setMessage(
        `設定保存に失敗しました: ${error.message}`
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
  自動計画
  ================================================
  */

  const planningRecommendations = useMemo(() => {
    const today = selectedDate;
    const todayMs = new Date(`${today}T00:00:00`).getTime();
    // 候補一覧は時間に収まるものだけに絞らず、登録済みの
    // 有効な教材・目標をすべて表示します。
    // 実際に選択できる時間はSTEP 4の合計時間チェックで管理します。

    const goalRecommendations = studyGoals
      .filter((goal) => goal.is_active !== false)
      .map((goal) => {
        const totalPages = Number(goal.total_pages || 0);
        const currentPage = Number(goal.current_page || 0);
        const remainingPages = Math.max(0, totalPages - currentPage);
        if (remainingPages <= 0) return null;

        const deadline = goal.deadline || today;
        const deadlineMs = new Date(`${deadline}T00:00:00`).getTime();
        const daysLeft = Math.max(
          1,
          Math.ceil((deadlineMs - todayMs) / 86400000) + 1
        );
        const minutesPerPage = Math.max(
          1,
          Number(goal.minutes_per_page || 1)
        );
        const desiredPages = Math.min(
          remainingPages,
          Math.max(1, Math.ceil(remainingPages / daysLeft))
        );

        return {
          goal,
          totalPages,
          currentPage,
          remainingPages,
          deadline,
          deadlineMs,
          daysLeft,
          minutesPerPage,
          desiredPages,
          priority: Math.min(5, Math.max(1, Number(goal.priority || 1))),
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.deadlineMs !== b.deadlineMs) return a.deadlineMs - b.deadlineMs;
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.remainingPages - a.remainingPages;
      })
      .map((item) => {
        // 各候補には「今日ならこのくらい」という提案量を持たせます。
        // 候補自体は時間不足でも消しません。
        const fittingPages = Math.min(
          item.desiredPages,
          item.remainingPages
        );

        const minutes = fittingPages * item.minutesPerPage;
        const startPage = item.currentPage + 1;
        const endPage = Math.min(
          item.totalPages,
          item.currentPage + fittingPages
        );
        const overdue = item.deadlineMs < todayMs;

        return {
          id: `goal-${item.goal.id}`,
          goalId: item.goal.id,
          subject: item.goal.subject || "その他",
          title: `${item.goal.title}（P.${startPage}〜${endPage}）`,
          baseTitle: item.goal.title,
          minutes,
          priority: item.priority,
          task_date: today,
          completed: false,
          studied_minutes: 0,
          remaining: minutes,
          deadline: item.deadline,
          remainingPages: item.remainingPages,
          goalTotalPages: item.totalPages,
          pagesToday: fittingPages,
          pageStart: startPage,
          pageEnd: endPage,
          recommendationType: "goal",
          pages: fittingPages,
          recommendationReason: overdue
            ? `期限を過ぎているため優先。今日取り組む候補としてP.${startPage}〜${endPage}を提案しています。`
            : `期限まで${item.daysLeft}日。進み具合と優先度を考慮し、今日取り組む候補としてP.${startPage}〜${endPage}を提案しています。`,
        };
      })
      .filter(Boolean);

    return goalRecommendations;
  }, [
    studyGoals,
    selectedDate,
    planningWindow,
    settings,
    fixedSchedules,
  ]);

  const planningSelectedTasks = useMemo(() => {
    return planningTaskIds
      .map((id) => {
        const existing = tasks.find((task) => task.id === id);
        if (existing) return existing;

        const recommendation = planningRecommendations.find((item) => item.id === id);
        if (!recommendation) return null;

        const edit = planningEdits[id] || {};
        const pageStart = Math.max(1, Number(edit.pageStart ?? recommendation.pageStart));
        const pages = Math.max(1, Number(edit.pages ?? recommendation.pagesToday));
        const pageEnd = Math.min(
          Number(recommendation.goalTotalPages || recommendation.pageEnd || pageStart + pages - 1),
          pageStart + pages - 1
        );
        const actualPages = Math.max(1, pageEnd - pageStart + 1);
        const minutes = Math.max(1, Number(edit.minutes ?? recommendation.minutes));

        return {
          ...recommendation,
          title: `${recommendation.baseTitle}（P.${pageStart}〜${pageEnd}）`,
          minutes,
          remaining: minutes,
          pageStart,
          pageEnd,
          pagesToday: actualPages,
          pages: actualPages,
        };
      })
      .filter(Boolean);
  }, [tasks, planningTaskIds, planningRecommendations, planningEdits]);

  const planningAvailableMinutes = useMemo(() => {
    const nextSettings = settingsForPlanningWindow(settings, selectedDate, planningWindow);
    return getAvailableMinutes(selectedDate, nextSettings, fixedSchedules);
  }, [selectedDate, planningWindow, settings, fixedSchedules]);

  const planningSelectedMinutes = planningSelectedTasks.reduce(
    (sum, task) => sum + Number(task.minutes || 0),
    0
  );

  const planningHasTimeOverflow =
    planningSelectedMinutes > planningAvailableMinutes;

  const planningMaxSubjects =
    planningMode === "focused"
      ? 2
      : planningMode === "balanced"
      ? 4
      : 3;

  const planningPreview = useMemo(() => {
    const nextSettings = settingsForPlanningWindow(settings, selectedDate, planningWindow);

    const generated = generatePlan({
      dateString: selectedDate,
      tasks: planningSelectedTasks,
      settings: nextSettings,
      fixedSchedules,
      eligibleTaskIds: planningTaskIds,
      maxSubjectsPerDay: planningMaxSubjects,
    });

    return {
      ...generated,
      plan: generated.plan.map((item) => {
        const source = planningSelectedTasks.find((task) => task.id === item.taskId);
        return {
          ...item,
          pageStart: source?.pageStart,
          pageEnd: source?.pageEnd,
        };
      }),
    };
  }, [
    selectedDate,
    planningSelectedTasks,
    planningTaskIds,
    planningWindow,
    planningMode,
    planningMaxSubjects,
    settings,
    fixedSchedules,
  ]);

  const startPlanningWizard = () => {
    setPlanningStep(1);
    const dayWindow = getWeekdaySettings(selectedDate, settings);
    setPlanningWindow({
      start: dayWindow.studyStart,
      end: dayWindow.studyEnd,
    });
    const initialRecommendations = planningRecommendations.slice(0, 8);
    const initialSubjectLimit = planningMode === "focused" ? 2 : planningMode === "balanced" ? 4 : 3;
    const recommendedSubjectNames = [];
    const recommendedIds = [];
    let remainingCapacity = getAvailableMinutes(
      selectedDate,
      settingsForPlanningWindow(settings, selectedDate, planningWindow),
      fixedSchedules
    );
    for (const task of initialRecommendations) {
      if (recommendedSubjectNames.includes(task.subject) || recommendedSubjectNames.length >= initialSubjectLimit) continue;
      const minutes = Number(task.minutes || 0);
      if (minutes > remainingCapacity) continue;
      recommendedSubjectNames.push(task.subject);
      recommendedIds.push(task.id);
      remainingCapacity -= minutes;
    }
    setPlanningTaskIds(recommendedIds);
    setPlanningRecommendedIds(recommendedIds);
    setPlanningEdits(
      Object.fromEntries(
        initialRecommendations
          .filter((task) => task.recommendationType === "goal")
          .map((task) => [task.id, {
            pageStart: task.pageStart,
            pages: task.pagesToday,
            minutes: task.minutes,
          }])
      )
    );
    setActiveTab("plan");
  };

  const finishPlanningWizard = async () => {
    const start = timeToMinutes(planningWindow.start);
    const end = timeToMinutes(planningWindow.end);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      setMessage("勉強終了時刻は開始時刻より後にしてください。");
      return;
    }

    // STEP 1の変更は今回の計画だけに適用し、曜日別デフォルトは上書きしません。


    const goalIds = [...new Set(
      planningPreview.plan
        .map((item) => item.taskId)
        .filter((id) => String(id).startsWith("goal-"))
        .map((id) => String(id).replace(/^goal-/, ""))
    )];

    const goalTaskIdMap = new Map();

    for (const goalId of goalIds) {
      const recommendation = planningRecommendations.find(
        (item) => item.id === `goal-${goalId}`
      );
      if (!recommendation) continue;

      const edited = planningSelectedTasks.find(
        (item) => item.id === `goal-${goalId}`
      ) || recommendation;

      if (session?.user?.id) {
        const { data, error } = await supabase
          .from("tasks")
          .insert({
            user_id: session.user.id,
            subject: edited.subject,
            title: `${recommendation.baseTitle}（P.${edited.pageStart}〜${edited.pageEnd}）`,
            minutes: Math.max(1, Number(edited.minutes || recommendation.minutes)),
            priority: edited.priority,
            task_date: selectedDate,
            completed: false,
            studied_minutes: 0,
          })
          .select()
          .single();

        if (error) {
          setMessage(`教材から今日のタスクを作成できませんでした: ${error.message}`);
          return;
        }

        const normalizedTask = normalizeTask(data, session.user.id);
        setTasks((current) => [...current, normalizedTask]);
        goalTaskIdMap.set(`goal-${goalId}`, normalizedTask.id);
      }
    }

    const normalizedPlan = planningPreview.plan.map((item, index) => ({
      ...item,
      taskId: goalTaskIdMap.get(item.taskId) || item.taskId,
      goalId: String(item.taskId).startsWith("goal-") ? String(item.taskId).replace(/^goal-/, "") : null,
      aiGenerated: true,
      reason: item.reason || "期限・進捗・優先度・今日の勉強時間をもとに提案",
      id: `plan-${Date.now()}-${index}`,
    }));

    setAiAdoptedPlan(normalizedPlan);

    if (session?.user?.id) {
      const { error: deleteError } = await supabase
        .from("study_plan_items")
        .delete()
        .eq("user_id", session.user.id)
        .eq("plan_date", selectedDate);

      if (deleteError) {
        console.error("既存計画の削除に失敗しました:", deleteError);
      } else if (normalizedPlan.length > 0) {
        const rows = normalizedPlan.map((item) => ({
          user_id: session.user.id,
          plan_date: selectedDate,
          task_id: item.taskId || null,
          goal_id: item.goalId || null,
          subject: item.subject || "その他",
          title: item.title || "学習",
          start_time: minutesToTime(item.start),
          end_time: minutesToTime(item.end),
          minutes: Number(item.minutes || 0),
          reason: item.reason || null,
        }));

        const { data: savedRows, error: saveError } = await supabase
          .from("study_plan_items")
          .insert(rows)
          .select();

        if (saveError) {
          console.error("計画の同期保存に失敗しました:", saveError);
          setMessage("計画は作成しましたが、他の端末への同期保存に失敗しました。study_plan_items.sqlを適用してください。");
        } else {
          setSavedPlanItems((current) => [
            ...current.filter((item) => item.plan_date !== selectedDate),
            ...(savedRows || []),
          ]);
        }
      }
    }

    try {
      localStorage.setItem(
        `studyflow_ai_plan_${selectedDate}`,
        JSON.stringify(normalizedPlan)
      );
    } catch (error) {
      console.error("計画の保存に失敗しました:", error);
    }

    setPlanningStep(1);
    setActiveTab("today");
    setMessage("今日の計画を作成しました。ホームで確認できます。");
  };

  const planData = useMemo(
    () =>
      generatePlan({
        dateString: selectedDate,
        tasks,
        settings,
        fixedSchedules,
      }),
    [
      selectedDate,
      tasks,
      settings,
      fixedSchedules,
    ]
  );

useEffect(() => {
  try {
    const adoptedKey =
      `studyflow_ai_plan_${selectedDate}`;

    const saved =
      localStorage.getItem(adoptedKey);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        setAiAdoptedPlan(parsed);
        return;
      }
    }
  } catch (error) {
    console.error(
      "保存済みAI計画の読み込みに失敗しました:",
      error
    );
  }

  setAiAdoptedPlan(null);
}, [selectedDate]);
/*
================================================
Gemini AI plan
================================================
*/

const syncedPlanForDate = useMemo(() => {
  return savedPlanItems
    .filter((item) => item.plan_date === selectedDate)
    .map((item) => ({
      taskId: item.task_id,
      goalId: item.goal_id,
      subject: item.subject,
      title: item.title,
      start: timeToMinutes(item.start_time),
      end: timeToMinutes(item.end_time),
      minutes: Number(item.minutes || 0),
      reason: item.reason || "",
      aiGenerated: true,
    }));
}, [savedPlanItems, selectedDate]);

const currentPlanForAI =
  aiAdoptedPlan || (syncedPlanForDate.length > 0 ? syncedPlanForDate : planData.plan);

const handleAdoptAIPlan = useCallback(
  async (aiPlan) => {
    if (!Array.isArray(aiPlan) || aiPlan.length === 0) {
      setMessage("採用できる学習計画がありません。");
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

        /*
         * 元のタスクを探す
         */
        const matchedTask = tasks.find((task) => {
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
        });

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

          reason:
            item.reason || "",

          type:
            item.type || "study",

          aiGenerated: true,
        };
      })
      .filter(Boolean);

    if (normalizedPlan.length === 0) {
      setMessage(
        "有効な学習計画が見つかりませんでした。"
      );
      return;
    }

    /*
     * 採用した計画を画面に反映
     */
    setAiAdoptedPlan(normalizedPlan);

    /*
     * 今日の計画タブへ移動
     */
    setActiveTab("today");

    /*
     * 保存できる状態にする
     */
    try {
      const adoptedKey =
        `studyflow_ai_plan_${selectedDate}`;

      localStorage.setItem(
        adoptedKey,
        JSON.stringify(normalizedPlan)
      );
    } catch (error) {
      console.error(
        "AI計画の保存に失敗しました:",
        error
      );
    }

    setMessage(
      "学習計画を採用しました。今日の自動計画に反映されています。"
    );
  },
  [tasks, selectedDate]
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
    setStudyLogs([]);
    setStudyGoals([]);
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
          {[
            ["today", "⌂", "ホーム"],
            ["goals", "📚", "教材・目標"],
            ["plan", "✦", "計画を立てる"],
            ["execute", "▶", "勉強を実行する"],
            ["calendar", "□", "カレンダー"],
            ["progress", "↗", "記録・進捗"],
            ["settings", "⚙", "設定"],
          ].map(([tab, icon, label]) => (
            <button
              key={tab}
              className={activeTab === tab ? "nav-button active" : "nav-button"}
              onClick={() => {
                if (tab === "plan") startPlanningWizard();
                else setActiveTab(tab);
              }}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
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
                      (currentPlanForAI || []).reduce(
                        (total, item) => total + Number(item.minutes || 0),
                        0
                      )
                    )}
                  </strong>
                  <small>
                    配置済み
                  </small>
                </div>
              </section>

              <div className="content-grid">
                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>今日の計画</h2>
                      <p>勉強できる時間・予定・タスクから作成した今日の計画です。</p>
                    </div>
                    <button className="secondary-button small" onClick={startPlanningWizard}>
                      計画を変更
                    </button>
                  </div>
                  {currentPlanForAI.length === 0 ? (
                    <div className="empty-state">
                      <strong>まだ今日の計画がありません</strong>
                      <p>「計画を立てる」から順番に確認して、今日の計画を作成してください。</p>
                      <button className="primary-button" onClick={startPlanningWizard}>
                        ✦ 計画を立てる
                      </button>
                    </div>
                  ) : (
                    <div className="plan-list">
                      {currentPlanForAI.map((item) => (
                        <div className="plan-item" key={item.id}>
                          <div className="plan-time">
                            {minutesToTime(item.start)}
                            <span>↓</span>
                            {minutesToTime(item.end)}
                          </div>
                          <div className="plan-bar">
                            <div className="subject-tag">{item.subject}</div>
                            <strong>{item.title}</strong>
                            <span>{item.minutes}分</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
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
                  <section className="card">
                    <div className="section-header">
                      <div>
                        <h2>固定予定</h2>
                        <p>
                          自動計画から除外されます
                        </p>
                      </div>
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
                  <p className="eyebrow">PLANNING</p>
                  <h1>計画を立てる</h1>
                  <p className="page-description">順番に答えるだけで、StudyFlowが今日の計画を作ります。</p>
                </div>
                <div className="date-control">
                  <button onClick={() => setSelectedDate(addDays(selectedDate, -1))}>←</button>
                  <input type="date" value={selectedDate} onChange={(e) => { setSelectedDate(e.target.value); setPlanningStep(1); }} />
                  <button onClick={() => setSelectedDate(addDays(selectedDate, 1))}>→</button>
                </div>
              </div>

              <section className="card">
                <div className="section-header">
                  <div>
                    <h2>STEP {planningStep} / 5</h2>
                    <p>今日の計画を作成します</p>
                  </div>
                </div>

                {planningStep === 1 && (
                  <div>
                    <h2>何時から何時まで勉強できますか？</h2>
                    <p className="muted">いつもの設定から変更点はありますか？設定で登録したこの曜日の時間を初期値にしています。変更がなければそのまま進み、今日は予定が違う場合だけ編集してください。</p>
                    {(() => {
                      const savedWindow = getWeekdaySettings(selectedDate, settings);
                      const changed = planningWindow.start !== savedWindow.studyStart || planningWindow.end !== savedWindow.studyEnd;
                      return <p className={changed ? "planning-capacity-note warning" : "planning-capacity-note"}>{changed ? "今日は設定と異なる時間で計画します。" : `設定値を使用中：${savedWindow.studyStart}〜${savedWindow.studyEnd}`} </p>;
                    })()}
                    <div className="form-row">
                      <label>開始時刻<input type="time" value={planningWindow.start} onChange={(e) => setPlanningWindow((v) => ({ ...v, start: e.target.value }))} /></label>
                      <label>終了時刻<input type="time" value={planningWindow.end} onChange={(e) => setPlanningWindow((v) => ({ ...v, end: e.target.value }))} /></label>
                    </div>
                    <div className="form-actions">
                      <button className="primary-button" onClick={() => setPlanningStep(2)}>次へ →</button>
                    </div>
                  </div>
                )}

                {planningStep === 2 && (
                  <div>
                    <h2>勉強できない予定はありますか？</h2>
                    <p className="muted">学校・塾・部活・食事などを登録すると、その時間を自動で避けます。</p>
                    <form className="compact-form" onSubmit={addFixedSchedule}>
                      <input value={fixedForm.title} onChange={(e) => setFixedForm((v) => ({ ...v, title: e.target.value, schedule_date: selectedDate }))} placeholder="例：塾" />
                      <div className="form-row">
                        <input type="time" value={fixedForm.start_time} onChange={(e) => setFixedForm((v) => ({ ...v, start_time: e.target.value }))} />
                        <input type="time" value={fixedForm.end_time} onChange={(e) => setFixedForm((v) => ({ ...v, end_time: e.target.value }))} />
                      </div>
                      <button className="secondary-button" type="submit">＋ 予定を追加</button>
                    </form>
                    <div className="fixed-list">
                      {selectedFixedSchedules.length === 0 ? <p className="muted">登録された固定予定はありません。</p> : selectedFixedSchedules.map((schedule) => (
                        <div className="fixed-item" key={schedule.id}>
                          <div><strong>{schedule.title}</strong><span>{schedule.start_time} - {schedule.end_time}</span></div>
                          <button onClick={() => deleteFixedSchedule(schedule.id)}>×</button>
                        </div>
                      ))}
                    </div>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setPlanningStep(1)}>← 戻る</button>
                      <button className="primary-button" onClick={() => setPlanningStep(3)}>次へ →</button>
                    </div>
                  </div>
                )}

                {planningStep === 3 && (
                  <div>
                    <h2>どれくらいの教科数で勉強しますか？</h2>
                    <p className="muted">ここで選んだ教科数をもとに、次のSTEPでStudyFlowがおすすめを作ります。あとから他の登録教材も追加できます。</p>
                    <div className="planning-mode-grid">
                      {[
                        ["focused", "集中型", "1〜2教科をじっくり進める", "2"],
                        ["standard", "標準型", "2〜3教科。おすすめ", "3"],
                        ["balanced", "バランス型", "3〜4教科を少しずつ進める", "4"],
                      ].map(([value, title, desc, count]) => (
                        <button type="button" key={value} className={`planning-mode-card ${planningMode === value ? "selected" : ""}`} onClick={() => setPlanningMode(value)}>
                          <strong>{title}</strong><span>{desc}</span><small>最大 {count} 教科</small>
                        </button>
                      ))}
                    </div>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setPlanningStep(2)}>← 戻る</button>
                      <button className="primary-button" onClick={() => {
                        const limit = planningMode === "focused" ? 2 : planningMode === "balanced" ? 4 : 3;
                        const ids = [];
                        const subjects = [];
                        let remainingCapacity = planningAvailableMinutes;
                        for (const task of planningRecommendations) {
                          if (subjects.includes(task.subject) || subjects.length >= limit) continue;
                          const minutes = Number(task.minutes || 0);
                          if (minutes > remainingCapacity) continue;
                          subjects.push(task.subject);
                          ids.push(task.id);
                          remainingCapacity -= minutes;
                        }
                        setPlanningTaskIds(ids);
                        setPlanningRecommendedIds(ids);
                        setPlanningStep(4);
                      }}>次へ →</button>
                    </div>
                  </div>
                )}

                {planningStep === 4 && (
                  <div>
                    <h2>今日やる教材を選びましょう</h2>
                    <p className="muted">StudyFlowのおすすめはチェック済みです。おすすめ以外の登録済み教材も自由に追加できます。チェックを外したり、ページ数・時間を変更したりできます。</p>
                    <div className="recommendation-list">
                      {planningRecommendations.length === 0 ? (
                        <div className="empty-state"><strong>終わらせたい教材がまだ登録されていません</strong><p>「教材・目標」から参考書や教材、期限、現在ページを登録すると、今日やるページを自動で提案します。</p></div>
                      ) : planningRecommendations.map((task) => {
                        const checked = planningTaskIds.includes(task.id);
                        const edit = planningEdits[task.id] || {
                          pageStart: task.pageStart,
                          pages: task.pagesToday,
                          minutes: task.minutes,
                        };
                        const pageStart = Math.max(1, Number(edit.pageStart ?? task.pageStart ?? 1));
                        const pages = Math.max(1, Number(edit.pages ?? task.pagesToday ?? 1));
                        const pageEnd = Math.min(Number(task.goalTotalPages || task.pageEnd || pageStart + pages - 1), pageStart + pages - 1);
                        const shownPages = Math.max(1, pageEnd - pageStart + 1);
                        const isRecommended = planningRecommendedIds.includes(task.id);
                        return (
                          <div className={`recommendation-item ${checked ? "selected" : ""}`} key={task.id}>
                            <div className="recommendation-main-row">
                              <input type="checkbox" checked={checked} onChange={() => setPlanningTaskIds((ids) => checked ? ids.filter((id) => id !== task.id) : [...ids, task.id])} />
                              <div className="recommendation-content">
                                <strong>{task.subject}：{task.baseTitle}</strong>
                                {isRecommended && <span className="recommendation-badge">StudyFlowおすすめ</span>}
                                <span>提案：P.{task.pageStart}〜P.{task.pageEnd} ・ {task.pagesToday}ページ ・ {formatMinutes(task.minutes)} ・ 期限 {task.deadline}</span>
                                <div className="recommendation-edit-grid">
                                  <label>開始ページ<input type="number" min="1" value={pageStart} onChange={(e) => setPlanningEdits((current) => ({ ...current, [task.id]: { ...edit, pageStart: Math.max(1, Number(e.target.value) || 1) } }))} /></label>
                                  <label>ページ数<input type="number" min="1" max={Number(task.goalTotalPages || 999999)} value={shownPages} onChange={(e) => setPlanningEdits((current) => ({ ...current, [task.id]: { ...edit, pages: Math.max(1, Number(e.target.value) || 1) } }))} /></label>
                                  <label>学習時間（分）<input type="number" min="1" value={Number(edit.minutes ?? task.minutes)} onChange={(e) => setPlanningEdits((current) => ({ ...current, [task.id]: { ...edit, minutes: Math.max(1, Number(e.target.value) || 1) } }))} /></label>
                                </div>
                                <span className="recommendation-custom-preview">実行：P.{pageStart}〜P.{pageEnd} ・ {shownPages}ページ ・ {formatMinutes(Number(edit.minutes ?? task.minutes))}</span>
                                {task.recommendationReason && <small>{task.recommendationReason}</small>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className={`planning-capacity-note ${planningHasTimeOverflow ? "warning" : ""}`}>
                      <strong>今日の勉強可能時間：{formatMinutes(planningAvailableMinutes)}</strong>
                      <span>選択中：{formatMinutes(planningSelectedMinutes)}</span>
                      {planningHasTimeOverflow ? (
                        <small>選択中の教材が勉強可能時間を超えています。学習時間を減らすか、教材のチェックを外してください。</small>
                      ) : (
                        <small>固定予定を除いた時間内に収まっています。</small>
                      )}
                    </div>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setPlanningStep(3)}>← 戻る</button>
                      <button className="primary-button" disabled={planningTaskIds.length === 0 || planningHasTimeOverflow} onClick={() => setPlanningStep(5)}>次へ →</button>
                    </div>
                  </div>
                )}

                {planningStep === 5 && (
                  <div>
                    <h2>今日の計画を確認</h2>
                    <p className="muted">選択した教材と勉強スタイルをもとに計画しています。問題なければ「この計画で決定」を押してください。</p>
                    <div className="plan-list">
                      {planningPreview.plan.length === 0 ? <div className="empty-state"><strong>計画を作れませんでした</strong><p>勉強時間・固定予定・おすすめタスクを確認してください。</p></div> : planningPreview.plan.map((item) => (
                        <div className="plan-item" key={`${item.taskId}-${item.start}-${item.end}`}>
                          <div className="plan-time">{minutesToTime(item.start)}<span>↓</span>{minutesToTime(item.end)}</div>
                          <div className="plan-bar"><div className="subject-tag">{item.subject}</div><strong>{item.title}</strong><span>{item.pageStart && item.pageEnd ? `P.${item.pageStart}〜P.${item.pageEnd} · ` : ""}{item.minutes}分</span></div>
                        </div>
                      ))}
                    </div>
                    <div className="planning-summary">
                      <div><span>勉強可能</span><strong>{formatMinutes(planningPreview.totalAvailable)}</strong></div>
                      <div><span>計画</span><strong>{formatMinutes(planningPreview.plannedMinutes)}</strong></div>
                    </div>
                    <div className="form-actions">
                      <button className="secondary-button" onClick={() => setPlanningStep(4)}>← 戻る</button>
                      <button className="primary-button" disabled={planningPreview.plan.length === 0} onClick={finishPlanningWizard}>✓ この計画で決定</button>
                    </div>
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "execute" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">EXECUTE</p>
                  <h1>勉強を実行する</h1>
                  <p className="page-description">今日の計画を見ながら、タイマーで実際の学習時間を記録します。</p>
                </div>
              </div>
              <section className="card timer-card">
                <div className="section-header"><div><h2>今から勉強する</h2><p>タスクを選んでタイマーを開始してください。</p></div></div>
                <select value={timerTaskId} onChange={(e) => setTimerTaskId(e.target.value)}>
                  <option value="">タスクを選択</option>
                  {selectedTasks.filter((task) => !task.completed).map((task) => <option key={task.id} value={task.id}>{task.subject}：{task.title}</option>)}
                </select>
                <div className="timer-display">{timerDisplay}</div>
                <div className="timer-buttons">
                  <button className="primary-button" disabled={!timerTaskId} onClick={() => setTimerRunning((current) => !current)}>{timerRunning ? "一時停止" : "スタート"}</button>
                  <button className="secondary-button" onClick={resetTimer}>リセット</button>
                  <button className="secondary-button" disabled={!timerTaskId || timerSeconds === 0} onClick={saveTimerSession}>学習終了</button>
                </div>
              </section>
              <section className="card">
                <div className="section-header"><div><h2>今日のスケジュール</h2><p>{formatDateJP(selectedDate)}</p></div></div>
                <div className="plan-list">
                  {currentPlanForAI.length === 0 ? <p className="muted">まだ今日の計画がありません。「計画を立てる」から作成してください。</p> : currentPlanForAI.map((item) => <div className="plan-item" key={item.id}><div className="plan-time">{minutesToTime(item.start)}<span>↓</span>{minutesToTime(item.end)}</div><div className="plan-bar"><div className="subject-tag">{item.subject}</div><strong>{item.title}</strong><span>{item.pageStart && item.pageEnd ? `P.${item.pageStart}〜P.${item.pageEnd} · ` : ""}{item.minutes}分</span></div><button className="secondary-button small" onClick={() => setTimerTaskId(item.taskId || "")}>選択</button></div>)}
                </div>
              </section>
            </>
          )}

          {activeTab === "goals" && (
            <>
              <div className="page-header">
                <div>
                  <p className="eyebrow">MATERIAL GOALS</p>
                  <h1>終わらせたい教材</h1>
                  <p className="page-description">参考書・問題集・教材の期限と進捗を登録すると、自動計画の提案の中心になります。</p>
                </div>
              </div>

              <div className="content-grid">
                <section className="card">
                  <div className="section-header">
                    <div>
                      <h2>{editingGoalId ? "教材を編集" : "教材を登録"}</h2>
                      <p>ページ数と期限から、今日進める量を自動計算します。</p>
                    </div>
                  </div>
                  <form className="settings-form" onSubmit={saveStudyGoal}>
                    <label>教材名<input value={goalForm.title} onChange={(e) => setGoalForm((v) => ({ ...v, title: e.target.value }))} placeholder="例：基礎問題精講 数III 積分" /></label>
                    <div className="form-row">
                      <label>科目<select value={goalForm.subject} onChange={(e) => setGoalForm((v) => ({ ...v, subject: e.target.value }))}>{SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label>
                      <label>期限<input type="date" value={goalForm.deadline} onChange={(e) => setGoalForm((v) => ({ ...v, deadline: e.target.value }))} /></label>
                    </div>
                    <div className="form-row">
                      <label>全ページ数<input type="number" min="1" value={goalForm.total_pages} onChange={(e) => setGoalForm((v) => ({ ...v, total_pages: e.target.value }))} /></label>
                      <label>現在ページ<input type="number" min="0" value={goalForm.current_page} onChange={(e) => setGoalForm((v) => ({ ...v, current_page: e.target.value }))} /></label>
                    </div>
                    <div className="form-row">
                      <label>1ページあたりの時間（分）<input type="number" min="0.5" step="0.5" value={goalForm.minutes_per_page} onChange={(e) => setGoalForm((v) => ({ ...v, minutes_per_page: e.target.value }))} /></label>
                      <label>優先度<select value={goalForm.priority} onChange={(e) => setGoalForm((v) => ({ ...v, priority: e.target.value }))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select></label>
                    </div>
                    <div className="form-actions">
                      {editingGoalId && <button type="button" className="secondary-button" onClick={resetGoalForm}>キャンセル</button>}
                      <button className="primary-button" type="submit">{editingGoalId ? "教材を更新" : "教材を登録"}</button>
                    </div>
                  </form>
                </section>

                <section className="card">
                  <div className="section-header">
                    <div><h2>登録済みの教材</h2><p>自動計画はここに登録した教材を優先して提案します。</p></div>
                  </div>
                  <div className="task-list">
                    {studyGoals.length === 0 && <div className="empty-state"><strong>まだ教材が登録されていません</strong><p>左のフォームから、終わらせたい参考書を登録してください。</p></div>}
                    {studyGoals.map((goal) => {
                      const remainingPages = Math.max(0, Number(goal.total_pages || 0) - Number(goal.current_page || 0));
                      const progress = Math.min(100, Math.round((Number(goal.current_page || 0) / Math.max(1, Number(goal.total_pages || 1))) * 100));
                      return (
                        <div className="task-item" key={goal.id}>
                          <div className="task-main">
                            <div className="task-title-row"><span className="subject-tag">{goal.subject}</span><strong>{goal.title}</strong></div>
                            <div className="task-meta">P.{goal.current_page} / {goal.total_pages} · 残り {remainingPages}ページ · 期限 {goal.deadline} · 優先度 {"★".repeat(Number(goal.priority || 1))}</div>
                            <div className="progress-line"><div style={{ width: `${progress}%` }} /></div>
                          </div>
                          <div className="task-actions">
                            {progressGoalId === goal.id ? (
                              <div className="progress-record">
                                <span>P.{goal.current_page} → P.</span>
                                <input
                                  type="number"
                                  min={goal.current_page}
                                  max={goal.total_pages}
                                  value={progressEndPage}
                                  onChange={(e) => setProgressEndPage(e.target.value)}
                                  aria-label="学習終了ページ"
                                />
                                <button onClick={() => saveProgressRecord(goal)}>記録</button>
                                <button onClick={() => setProgressGoalId("")}>キャンセル</button>
                              </div>
                            ) : (
                              <button onClick={() => startProgressRecord(goal)}>進捗を記録</button>
                            )}
                            <button onClick={() => editStudyGoal(goal)}>編集</button>
                            <button onClick={() => deleteStudyGoal(goal.id)}>×</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </div>
            </>
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
                <section className="card manual-record-card">
                  <div className="section-header">
                    <div>
                      <h2>学習時間を手動で記録</h2>
                      <p>タイマーを使わずに、あとから学習時間を追加できます。</p>
                    </div>
                  </div>

                  <form className="settings-form" onSubmit={saveManualStudyTime}>
                    <div className="form-row">
                      <label>
                        日付
                        <input
                          type="date"
                          value={manualRecordDate}
                          onChange={(e) => setManualRecordDate(e.target.value)}
                        />
                      </label>

                      <label>
                        学習時間（分）
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={manualRecordMinutes}
                          onChange={(e) => setManualRecordMinutes(e.target.value)}
                        />
                      </label>
                    </div>

                    <div className="form-row">
                      <label>
                        科目
                        <select
                          value={manualRecordSubject}
                          onChange={(e) => setManualRecordSubject(e.target.value)}
                        >
                          {Array.from(
                            new Set([
                              "その他",
                              ...tasks.map((task) => task.subject).filter(Boolean),
                            ])
                          ).map((subject) => (
                            <option key={subject} value={subject}>
                              {subject}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label>
                        関連タスク（任意）
                        <select
                          value={manualRecordTaskId}
                          onChange={(e) => setManualRecordTaskId(e.target.value)}
                        >
                          <option value="">タスクを指定しない</option>
                          {tasks
                            .filter((task) => !task.completed)
                            .map((task) => (
                              <option key={task.id} value={task.id}>
                                {task.subject}：{task.title}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>

                    <button className="primary-button" type="submit">
                      学習時間を記録
                    </button>
                  </form>
                </section>

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

              <section className="card weekday-settings-card">
                <div className="section-header">
                  <div>
                    <h2>曜日ごとの予定・勉強時間</h2>
                    <p>月曜日から日曜日まで、曜日別に勉強できる時間と学校・塾・部活などを登録できます。</p>
                  </div>
                </div>
                <label>
                  設定する曜日
                  <select value={weekdayEditorDay} onChange={(e) => setWeekdayEditorDay(Number(e.target.value))}>
                    {WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
                  </select>
                </label>
                {(() => {
                  const daySettings = normalizeSettings(settingsForm).weekdaySettings[String(weekdayEditorDay)];
                  return <>
                    <div className="form-row weekday-time-row">
                      <label>勉強開始<input type="time" value={daySettings.studyStart} onChange={(e) => updateWeekdaySetting(weekdayEditorDay, { studyStart: e.target.value })} /></label>
                      <label>勉強終了<input type="time" value={daySettings.studyEnd} onChange={(e) => updateWeekdaySetting(weekdayEditorDay, { studyEnd: e.target.value })} /></label>
                    </div>
                    <h3>この曜日の固定予定</h3>
                    {(daySettings.schedules || []).length === 0 && <p className="muted">予定はまだ登録されていません。</p>}
                    <div className="fixed-list">
                      {(daySettings.schedules || []).map((item) => <div className="fixed-item" key={item.id}>
                        <div><strong>{item.title}</strong><span>{item.start_time} - {item.end_time} · {FIXED_CATEGORIES.find((c) => c.value === item.category)?.label || "その他"}</span></div>
                        <button type="button" onClick={() => deleteWeekdaySchedule(item.id)}>×</button>
                      </div>)}
                    </div>
                    <div className="weekday-schedule-form">
                      <label>予定名<input value={weekdayScheduleDraft.title} onChange={(e) => setWeekdayScheduleDraft((v) => ({ ...v, title: e.target.value }))} placeholder="例：学校、塾、部活" /></label>
                      <div className="form-row">
                        <label>開始<input type="time" value={weekdayScheduleDraft.start_time} onChange={(e) => setWeekdayScheduleDraft((v) => ({ ...v, start_time: e.target.value }))} /></label>
                        <label>終了<input type="time" value={weekdayScheduleDraft.end_time} onChange={(e) => setWeekdayScheduleDraft((v) => ({ ...v, end_time: e.target.value }))} /></label>
                      </div>
                      <label>種類<select value={weekdayScheduleDraft.category} onChange={(e) => setWeekdayScheduleDraft((v) => ({ ...v, category: e.target.value }))}>{FIXED_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
                      <button type="button" className="secondary-button" onClick={addWeekdaySchedule}>この曜日に予定を追加</button>
                    </div>
                    <p className="muted">曜日ごとの設定は、下の「設定を保存」を押すと保存されます。設定後は計画作成時の初期値に反映されます。</p>
                  </>;
                })()}
              </section>

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