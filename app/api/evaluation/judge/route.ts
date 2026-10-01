import { NextResponse } from "next/server";
import { getOpenAIClient } from "../../../../lib/openai";

interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  contextRetention: number;
  consistency: number;
  overallScore: number;
  passed: boolean;
  explanation: string;
}

// Az értékelési kérés fogadása.
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const question = String(
      body.question ?? ""
    ).trim();

    const answer = String(
      body.answer ?? ""
    ).trim();

    const conversation = String(
      body.conversation ?? ""
    ).trim();

    const expectedBehavior = String(
      body.expectedBehavior ?? ""
    ).trim();

    const evaluationType = String(
      body.evaluationType ?? "single-turn"
    ).trim();

    if (!answer) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Az értékelendő válasz megadása kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    if (!question && !conversation) {
      return NextResponse.json(
        {
          success: false,
          message:
            "A kérdés vagy a beszélgetés megadása kötelező.",
        },
        {
          status: 400,
        }
      );
    }

    const client = getOpenAIClient();

    const model =
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      "gpt-4o-mini";

    const judgePrompt = createJudgePrompt({
      evaluationType,
      question,
      answer,
      conversation,
      expectedBehavior,
    });

    const completion =
      await client.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content:
              "Objektív AI-válasz értékelő vagy. " +
              "Kizárólag érvényes JSON formátumban válaszolj.",
          },
          {
            role: "user",
            content: judgePrompt,
          },
        ],
        response_format: {
          type: "json_object",
        },
        temperature: 0,
      });

    const content =
      completion.choices[0]?.message.content;

    if (!content) {
      throw new Error(
        "Az LLM Judge nem adott vissza értékelést."
      );
    }

    const parsedResult =
      JSON.parse(content) as JudgeResult;

    const result = normalizeJudgeResult(
      parsedResult,
      evaluationType
    );

    return NextResponse.json({
      success: true,
      model,
      evaluationType,
      result,
    });
  } catch (error) {
    console.error("LLM Judge hiba:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Ismeretlen értékelési hiba történt.",
      },
      {
        status: 500,
      }
    );
  }
}

// Elkészíti a single-turn vagy multi-turn Judge promptot.
function createJudgePrompt({
  evaluationType,
  question,
  answer,
  conversation,
  expectedBehavior,
}: {
  evaluationType: string;
  question: string;
  answer: string;
  conversation: string;
  expectedBehavior: string;
}) {
  const isMultiTurn =
    evaluationType === "multi-turn";

  const inputText = isMultiTurn
    ? `
Teljes beszélgetés:
${conversation}

Utolsó asszisztensválasz:
${answer}
`
    : `
Felhasználói kérdés:
${question}

Asszisztensválasz:
${answer}
`;

  return `
Értékeld az AI receptasszisztens működését.

Evaluáció típusa:
${evaluationType}

${inputText}

Elvárt viselkedés:
${expectedBehavior || "Nincs külön elvárás megadva."}

Adj 1 és 5 közötti egész pontszámot.

relevance:
Mennyire releváns a válasz?

instructionFollowing:
Mennyire követi a válasz a felhasználói kérést és az elvárt viselkedést?

groundedness:
Mennyire kerüli a válasz a nem igazolható vagy kitalált állításokat?

clarity:
Mennyire világos és érthető a válasz?

contextRetention:
Mennyire őrizte meg az asszisztens a korábbi beszélgetési fordulókban megadott feltételeket?

Single-turn evaluációnál a contextRetention értéke legyen 5.

consistency:
Mennyire következetes a válasz a beszélgetés korábbi részeivel?

Single-turn evaluációnál a consistency értéke legyen 5.

Az overallScore a relevance, instructionFollowing, groundedness, clarity, contextRetention és consistency pontszámok átlaga legyen.

A passed értéke akkor legyen true, ha az overallScore legalább 3.5.

Kizárólag érvényes JSON-választ adj ebben a formában:

{
  "relevance": 1,
  "instructionFollowing": 1,
  "groundedness": 1,
  "clarity": 1,
  "contextRetention": 1,
  "consistency": 1,
  "overallScore": 1,
  "passed": false,
  "explanation": "Rövid magyar nyelvű indoklás."
}
`;
}

// Biztonságosan normalizálja a Judge pontszámait.
function normalizeJudgeResult(
  result: JudgeResult,
  evaluationType: string
): JudgeResult {
  const relevance = normalizeScore(
    result.relevance
  );

  const instructionFollowing = normalizeScore(
    result.instructionFollowing
  );

  const groundedness = normalizeScore(
    result.groundedness
  );

  const clarity = normalizeScore(
    result.clarity
  );

  const contextRetention =
    evaluationType === "multi-turn"
      ? normalizeScore(result.contextRetention)
      : 5;

  const consistency =
    evaluationType === "multi-turn"
      ? normalizeScore(result.consistency)
      : 5;

  const overallScore = Number(
    (
      (
        relevance +
        instructionFollowing +
        groundedness +
        clarity +
        contextRetention +
        consistency
      ) / 6
    ).toFixed(2)
  );

  return {
    relevance,
    instructionFollowing,
    groundedness,
    clarity,
    contextRetention,
    consistency,
    overallScore,
    passed: overallScore >= 3.5,
    explanation:
      String(result.explanation ?? "").trim() ||
      "Nem érkezett részletes indoklás.",
  };
}

// A pontszámot 1 és 5 közé korlátozza.
function normalizeScore(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 1;
  }

  return Math.min(
    5,
    Math.max(1, Math.round(numericValue))
  );
}