import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { z } from "zod";

export async function POST({ params, request, locals }) {
	const { score } = z
		.object({
			score: z.number().int().min(-1).max(1),
		})
		.parse(await request.json());
	const conversationId = new ObjectId(params.id);
	const messageId = params.messageId;

	const document = await collections.conversations.updateOne(
		{
			_id: conversationId,
			...authCondition(locals),
			"messages.id": messageId,
		},
		{
			...(score !== 0
				? {
						$set: {
							"messages.$.score": score,
						},
				  }
				: { $unset: { "messages.$.score": "" } }),
		}
	);

	if (!document.matchedCount) {
		throw error(404, "Message not found");
	}

	
	// Update and set the ES message ID to the Message to Write ID
	const r = await fetch("http://eschat:9200/ati-search-history/_update_by_query", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			"script": {
				"inline": `ctx._source.score = '${score}'`,
				"lang": "painless"
			},
			"query": {
			"bool": {
				"must": [
					{
						"match": {
							"message_id": `${messageId}`
						}
					},
					{
						"match": {
							"session_id": `${conversationId}`
						}
					}
				]
			}
			}
		}),
	});

	// if message not found in ElasticSearch then throw an error
	if(!r.ok){
		throw error(404, "Message not found");
	}


	return new Response();
}
