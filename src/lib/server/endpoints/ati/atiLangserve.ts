import { buildPrompt } from "$lib/buildPrompt";
import { z } from "zod";
import type { Endpoint } from "../endpoints";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import { logger } from "$lib/server/logger";

export const endpointAtiLangserveParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("atilangserve"),
	url: z.string().url(),
});

export function endpointAtiLangserve(
	input: z.input<typeof endpointAtiLangserveParametersSchema>
): Endpoint {
	const { url, model } = endpointAtiLangserveParametersSchema.parse(input);

	return async ({ messages, preprompt, continueMessage }) => {
		const prompt = await buildPrompt({
			messages,
			continueMessage,
			preprompt,
			model,
		});

		// Get the messages that are from users
		let ms = messages.filter(m=> ( ("id" in m) && ("from" in m && m["from"] == "user") ) );

		//console.log("Cookie--------------------------->>>", model.config.configurable.cookie, model.config.configurable.session_id);
		//console.log("Messages: --------------------->>>", messages.length );

		const r = await fetch(`${url}/stream`, {
			credentials: "same-origin",
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Cookie": model.config.configurable.cookie
			},
			body: JSON.stringify({
				input: ms.length <= 0? prompt : ms[ms.length - 1].content,
				config: { configurable: {
								user_id: ms.length <= 0 ? "-1" : model.config.configurable.user_id,
								session_id: ms.length <= 0 ? "-1" : model.config.configurable.session_id
							} },
			}),
		});

		if (!r.ok) {
			throw new Error(`Failed to generate text: ${await r.text()}`);
		}

		const encoder = new TextDecoderStream();
		const reader = r.body?.pipeThrough(encoder).getReader();

		return (async function* () {
			let stop = false;
			let generatedText = "";
			let context = [];
			let tokenId = 0;
			let accumulatedData = ""; // Buffer to accumulate data chunks

			while (!stop) {
				// Read the stream and log the outputs to console
				const out = (await reader?.read()) ?? { done: false, value: undefined };

				// If it's done, we cancel
				if (out.done) {
					reader?.cancel();
					return;
				}

				if (!out.value) {
					return;
				}

				// Accumulate the data chunk
				accumulatedData += out.value;
				// Keep read data to check event type
				const eventData = out.value;

				// Process each complete JSON object in the accumulated data
				while (accumulatedData.includes("\n")) {
					// Assuming each JSON object ends with a newline
					const endIndex = accumulatedData.indexOf("\n");
					let jsonString = accumulatedData.substring(0, endIndex).trim();
					// Remove the processed part from the buffer

					accumulatedData = accumulatedData.substring(endIndex + 1);

					// Stopping with end event
					if (eventData.startsWith("event: end")) {
						stop = true;
						yield {
							token: {
								id: tokenId++,
								text: "",
								logprob: 0,
								special: true,
							},
							generated_text: generatedText,
							details: null,
						} satisfies TextGenerationStreamOutput;
						reader?.cancel();
						continue;
					}

					if (eventData.startsWith("event: data") && jsonString.startsWith("data: ")) {
						jsonString = jsonString.slice(6);
						let data = null;

						// Handle the parsed data
						try {
							data = JSON.parse(jsonString);
						} catch (e) {
							logger.error(e, "Failed to parse JSON");
							logger.error(jsonString, "Problematic JSON string:");
							continue; // Skip this iteration and try the next chunk
						}
						// Assuming content within data is a plain string
						if (data) {
							// Pull out the Context and answer seperately
							let _context = {},
								_answer = "";
							if(data.hasOwnProperty("answer")){
								_answer = data['answer'];
							}
							if(data.hasOwnProperty("context")){
								_context = data['context'];
							}
							generatedText += _answer;
							if(_context.length > 0)
								context = context.concat(_context);
							const output: TextGenerationStreamOutput = {
								token: {
									id: tokenId++,
									text: _answer,
									logprob: 0,
									special: false,
								},
								generated_text: null,
								details: null,
							};
							yield output;
						}
					}
				}
			}
		})();
	};
}

export default endpointAtiLangserve;
