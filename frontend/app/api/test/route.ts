import { NextRequest, NextResponse } from "next/server";
import { runChatCompletion as runOpenAIChatCompletion } from "@/convex/_utils/internalUtils";
import { runChatCompletion as runGeminiChatCompletion } from "@/convex/_utils/internalGemini";

const MODEL_PROVIDER =
  (process.env.CHAT_MODEL_PROVIDER ?? "gemini").toLowerCase();

const runChatCompletion =
  MODEL_PROVIDER === "openai"
    ? runOpenAIChatCompletion
    : runGeminiChatCompletion;

// export async function POST(req: NextRequest) {
//   const body = await req.json();
//   // console.log(body);
//   // {
//   //   skinConcern: body.skinConcern,
//   //   skinType: "oily",
//   //   ingredientsToAvoid: ["alcohol"],
//   //   fragranceFree: true,
//   // }
//   try {
//     // const result = await fetchAction(api.products.recommend, body);
//     // const result = await fetchQuery(api.products.getEssentialProducts, body);

//     // const res = await fetchMutation(api.products.seedProductsFromFile);

//     const result = await fetchAction(api.routine.createRoutine, body);

//     return NextResponse.json({
//       success: true,
//       message: "ran successfully",
//       result: result,
//     });
//   } catch (error: unknown) {
//     console.error("Error getting product recommendations ", error);

//     return NextResponse.json(
//       {
//         success: false,
//         message:
//           error instanceof Error ? error.message : "Unexpected error occurred",
//       },
//       { status: 500 }
//     );
//   }
// }

export async function POST(req: NextRequest) {
  const body = await req.json();
  // console.log(body);
  // {
  //   skinConcern: body.skinConcern,
  //   skinType: "oily",
  //   ingredientsToAvoid: ["alcohol"],
  //   fragranceFree: true,
  // }
  try {
    // const result = await fetchAction(api.products.recommend, body);
    // const result = await fetchQuery(api.products.getEssentialProducts, body);

    // const res = await fetchMutation(api.products.seedProductsFromFile);

    // const result = await fetchAction(api.routine.createRoutine, body);
    const userPrompt = body.message;

    if (!userPrompt) throw new Error("Please provide a prompt");

    // openai
    const message = await runChatCompletion(
      userPrompt + " Please give me the response in JSON format"
    );

    // claude

    // const claudeMessage = await runChatCompletion(
    //   userPrompt + " Please give me the response in JSON format"
    // );

    return NextResponse.json({
      success: true,
      message: "ran successfully",
      // result: result,
      result: message,
    });
  } catch (error: unknown) {
    console.error("Error getting product recommendations ", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Unexpected error occurred",
      },
      { status: 500 }
    );
  }
}

// claude response format:
// {
//   "id": "msg_01Aq9w938a90dw8q",
//   "model": "claude-sonnet-4-5",
//   "stop_reason": "tool_use",
//   "role": "assistant",
//   "content": [
//     {
//       "type": "text",
//       "text": "I'll check the current weather in San Francisco for you."
//     },
//     {
//       "type": "tool_use",
//       "id": "toolu_01A09q90qw90lq917835lq9",
//       "name": "get_weather",
//       "input": {"location": "San Francisco, CA", "unit": "celsius"}
//     }
//   ]
// }

// openai response format:
// "content": [
//   {
//       "id": "fc_12345xyz",
//       "call_id": "call_12345xyz",
//       "type": "function_call",
//       "name": "get_weather",
//       "arguments": "{\"location\":\"Paris, France\"}"
//   },
//   {
//       "id": "fc_67890abc",
//       "call_id": "call_67890abc",
//       "type": "function_call",
//       "name": "get_weather",
//       "arguments": "{\"location\":\"Bogotá, Colombia\"}"
//   },
//   {
//       "id": "fc_99999def",
//       "call_id": "call_99999def",
//       "type": "function_call",
//       "name": "send_email",
//       "arguments": "{\"to\":\"bob@email.com\",\"body\":\"Hi bob\"}"
//   }
// ]

// normally we dont throw errors in backend but for get query wrappers we can do this to trigger an error boundary
