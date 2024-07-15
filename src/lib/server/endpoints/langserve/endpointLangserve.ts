import { buildPrompt } from "$lib/buildPrompt";
import { z } from "zod";
import type { Endpoint } from "../endpoints";
import type { TextGenerationStreamOutput } from "@huggingface/inference";
import { logger } from "$lib/server/logger";

export const endpointLangserveParametersSchema = z.object({
	weight: z.number().int().positive().default(1),
	model: z.any(),
	type: z.literal("langserve"),
	url: z.string().url(),
});

export function endpointLangserve(
	input: z.input<typeof endpointLangserveParametersSchema>
): Endpoint {
	const { url, model } = endpointLangserveParametersSchema.parse(input);

	return async ({ messages, preprompt, continueMessage }) => {

		// Get the messages that are from users
		let ms = messages.filter(m=> ( ("id" in m) && ("from" in m && m["from"] == "user") ) );

		if(ms.length <= 0){
			return (async function*() { return; })();
		}

		const r = await fetch(`${url}/stream`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				input: ms.length <= 0 ? "" : ms[ms.length - 1].content , //{ text: prompt },
				config: { configurable: {
								user_id: model.config.configurable.user_id,
								session_id: model.config.configurable.session_id
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
			let tokenId = 0;

			let _generatedText = "";

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

				// Keep read data to check event type
				const eventData = out.value;

				let split_arr = eventData.split("\r\n");
				let i = 0;
				let o = split_arr[i];
				let _data = "";
				while( i < split_arr.length){

					if( split_arr.length > i && o.startsWith("event: data") && split_arr[i + 1].startsWith("data: ") )
						_data += split_arr[i + 1].slice(6);
					else if(o.startsWith("event: end")){
						// Stopping with end event
						stop = true;
						yield {
							token: {
								id: tokenId++,
								text: "",
								logprob: 0,
								special: true,
							},
							generated_text: _generatedText,
							details: null,
						} satisfies TextGenerationStreamOutput;
						reader?.cancel();
						break;
					}
					i++;
					o = split_arr[i];
				}


				if (_data != "") {

					// Handle the parsed data
					try {
						_data = JSON.parse(_data);
					} catch (e) {
						logger.error(e, "Failed to parse JSON");
						logger.error(_data, "Problematic JSON string:");
						continue; // Skip this iteration and try the next chunk
					}
				
					_generatedText += _data['answer'];
					const output: TextGenerationStreamOutput = {
						token: {
							id: tokenId++,
							text: _data['answer'],
							logprob: 0,
							special: false,
						},
						generated_text: null,
						details: null,
					};
					yield output;
				}

			}
		})();
	};
}

export default endpointLangserve;
