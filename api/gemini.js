import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;

function sendJson(res, status, data) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

const planSchema = {
  type: "object",
  properties: {
    summary: {
      type: "string",
    },
    advice: {
      type: "string",
    },
    plan: {
      type: "array",
      items: {
        type: "object",
        properties: {
          start: {
            type: "string",
          },
          end: {
            type: "string",
          },
          type: {
            type: "string",
            enum: ["study", "break", "fixed"],
          },
          taskTitle: {
            type: "string",
          },
          subject: {
            type: "string",
          },
          minutes: {
            type: "integer",
          },
          reason: {
            type: "string",
          },
        },
        required: [
          "start",
          "end",
          "type",
          "taskTitle",
          "subject",
          "minutes",
          "reason",
        ],
      },
    },
    remainingTasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: {
            type: "string",
          },
          minutes: {
            type: "integer",
          },
          reason: {
            type: "string",
          },
        },
        required: ["title", "minutes", "reason"],
      },
    },
  },
  required: [
    "summary",
    "advice",
    "plan",
    "remainingTasks",
  ],
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      error: "POST method is required.",
    });
  }

  if (!GEMINI_API_KEY || !ai) {
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY is not configured.",
    });
  }

  try {
    // =========================================
    // Supabase authentication
    // =========================================

    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return sendJson(res, 401, {
        error: "Authentication is required.",
      });
    }

    const accessToken = authorization
      .replace("Bearer ", "")
      .trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return sendJson(res, 500, {
        error: "Supabase environment variables are missing.",
      });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return sendJson(res, 401, {
        error: "Invalid authentication.",
      });
    }

    // =========================================
    // Request data
    // =========================================

    const {
      date,
      tasks = [],
      fixedSchedules = [],
      settings = {},
      currentPlan = [],
      userMessage = "",
    } = req.body || {};

    if (!date) {
      return sendJson(res, 400, {
        error: "date is required.",
      });
    }

    // =========================================
    // System instruction
    // =========================================

    const systemInstruction = `
あなたはStudyFlowのAI学習プランナーです。

高校生の受験勉強を支援するため、
ユーザーのタスク、優先度、固定予定、勉強可能時間を分析して、
現実的で実行しやすい1日の学習計画を作成してください。

必ず以下のルールを守ってください。

1. 固定予定と勉強時間を重複させない。
2. 実際の勉強可能時間を超えない。
3. 完了済みタスクは計画しない。
4. 優先度の高いタスクを優先する。
5. タスクの必要時間を大きく勝手に変更しない。
6. 長時間連続しすぎないよう適度に休憩を入れる。
7. ユーザーの追加要望をできる限り反映する。
8. すべてのタスクを終えられない場合は無理に詰め込まない。
9. 終わらないタスクはremainingTasksに入れる。
10. 時刻は24時間表記にする。
11. startとendから計算した時間とminutesを一致させる。
12. planは時間順に並べる。
13. typeは "study"、"break"、"fixed" のいずれか。
14. 固定予定にはtype="fixed"を使用する。
15. 休憩にはtype="break"を使用する。
16. 勉強にはtype="study"を使用する。
17. 空き時間が少ない場合は、優先度の低いタスクをremainingTasksに回す。
18. 現実的に実行できる計画を優先し、予定を過密にしない。

必ず指定されたJSON Schemaに従ってJSONだけを返してください。
`;

    // =========================================
    // User input
    // =========================================

    const input = `
今日の日付：
${date}

【ユーザーID】
${user.id}

【学習設定】
${JSON.stringify(settings, null, 2)}

【タスク】
${JSON.stringify(tasks, null, 2)}

【固定予定】
${JSON.stringify(fixedSchedules, null, 2)}

【現在の自動計画】
${JSON.stringify(currentPlan, null, 2)}

【ユーザーからの追加要望】
${userMessage || "特になし"}

これらをすべて考慮して、
今日実行しやすい学習計画を作成してください。
`;

    // =========================================
    // Gemini Generate Content API
    // =========================================

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",

      contents: input,

      config: {
        systemInstruction,

        responseMimeType: "application/json",

        responseSchema: planSchema,
      },
    });

    const outputText = response.text || "";

    if (!outputText) {
      console.error("Gemini returned empty response.");

      return sendJson(res, 502, {
        error:
          "Geminiから空の応答が返されました。",
      });
    }

    // =========================================
    // JSON parse
    // =========================================

    let result;

    try {
      result = JSON.parse(outputText);
    } catch (error) {
      console.error(
        "Gemini JSON parse error:",
        error
      );

      console.error(
        "Gemini output:",
        outputText
      );

      return sendJson(res, 502, {
        error:
          "Geminiから正しいJSONを取得できませんでした。",
      });
    }

    // =========================================
    // Response
    // =========================================

    return sendJson(res, 200, {
      success: true,

      summary: result.summary || "",

      advice: result.advice || "",

      plan: Array.isArray(result.plan)
        ? result.plan
        : [],

      remainingTasks: Array.isArray(
        result.remainingTasks
      )
        ? result.remainingTasks
        : [],
    });
  } catch (error) {
    console.error(
      "Gemini API error:",
      error
    );

    const message =
      error?.message ||
      "Gemini API request failed.";

    // 403の場合は、原因を画面に分かりやすく返す
    if (
      error?.status === 403 ||
      error?.code === 403 ||
      String(message).includes("403") ||
      String(message).includes(
        "denied access"
      )
    ) {
      return sendJson(res, 403, {
        error:
          "Gemini APIへのアクセスが拒否されています。Google AI Studio / Google Cloud側のプロジェクト設定を確認してください。",
      });
    }

    return sendJson(res, 500, {
      error: message,
    });
  }
}
