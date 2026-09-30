import { NextResponse } from "next/server";
import { getOpenAIClient } from "../../../../lib/openai";

interface JudgeResult {
  relevance: number;
  instructionFollowing: number;
  groundedness: number;
  clarity: number;
  overallScore: number;
  passed: boolean;
  explanation: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const question = String(body.question ?? "").trim();
    const answer = String(body.answer ?? "").trim();
    const expectedBehavior = String(
      body.expectedBehavior ?? ""
    ).trim();

    if (!question || !answer) {
      return NextResponse.json(
        {
          success: false,
          message: "A kérdés és a válasz megadása kötelező.",
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

    const judgePrompt = `
Értékeld az AI receptasszisztens válaszát.

Felhasználói kérdés:
${question}

Asszisztens válasza:
${answer}

Elvárt viselkedés:
${expectedBehavior || "Nincs külön elvárás megadva."}

Adj 1 és 5 közötti egész pontszámot az alábbi szempontokra:

relevance:
Mennyire releváns az asszisztens válasza?

instructionFollowing:
Mennyire követi a válasz a felhasználói kérést és az elvárt viselkedést?

groundedness:
Mennyire kerüli a válasz a nem igazolható vagy kitalált állításokat?

clarity:
Mennyire világos és érthető a válasz?

Az overallScore legyen a négy pontszám átlaga.

A passed értéke akkor legyen true, ha az overallScore legalább 3.5.

Kizárólag érvényes JSON-választ adj az alábbi formában:

{
  "relevance": 1,
  "instructionFollowing": 1,
  "groundedness": 1,
  "clarity": 1,
  "overallScore": 1,
  "passed": false,
  "explanation": "Rövid magyar nyelvű indoklás."
}
`;

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

    const result = JSON.parse(content) as JudgeResult;

    return NextResponse.json({
      success: true,
      model,
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