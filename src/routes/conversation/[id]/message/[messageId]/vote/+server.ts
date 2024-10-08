import { authCondition } from "$lib/server/auth";
import { collections } from "$lib/server/database";
import { error } from "@sveltejs/kit";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { ESChatHistoryUpdateScore } from "$lib/utils/elasticsearchLog.js";


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


	// On Score Update
	//console.log( "--------------->>>>", String(messageId), String(conversationId), score );
	ESChatHistoryUpdateScore( String(conversationId), String(messageId), score );



	return new Response();
}
