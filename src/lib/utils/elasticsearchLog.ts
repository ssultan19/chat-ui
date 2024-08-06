import { env } from "$env/dynamic/private";
import { Client } from '@elastic/elasticsearch';


/**
 * Connect to ES
 */


/**
 * Save Message to ElasticSearch
 */
export async function ESChatHistorySave(
    userId: string, 
    conversationId: string,
    messageId: string,
	message: string,
    es_client: Client = new Client({
        node: `${env.ELASTICSEARCH_LOG_SCHEME}://${env.ELASTICSEARCH_LOG_HOST}:${env.ELASTICSEARCH_LOG_PORT}`,
        auth: {
          username: env.ELASTICSEARCH_LOG_USERNAME,
          password: env.ELASTICSEARCH_LOG_PASSWORD
        }
    }) ){

    //console.log(`HF envs: ${env.ELASTICSEARCH_LOG_ENABLED} | ${env.ELASTICSEARCH_LOG_SCHEME} | ${env.ELASTICSEARCH_LOG_HOST} | ${env.ELASTICSEARCH_LOG_PORT} | ${env.ELASTICSEARCH_LOG_INDEX}`);
    //console.log(`Message ID: ${messageId} | Message: ${message}`);

    // Create ElasticSearch Client
    try{
        
        await es_client.index({
            index: env.ELASTICSEARCH_LOG_INDEX,
            document: {
                message_id: messageId,
                created_at: new Date(),
                user_id: userId,
                session_id: conversationId,
                message: message,
                hf_score: 0,
            },
            refresh: true,
        });

    }catch(e){
        console.error(e);
    }


}



/**
 * Delete messages with a conversation ID in ElasticSearch
 */
export async function ESChatHistoryDelete(
    conversationId: string,
    es_client: Client = new Client({
        node: `${env.ELASTICSEARCH_LOG_SCHEME}://${env.ELASTICSEARCH_LOG_HOST}:${env.ELASTICSEARCH_LOG_PORT}`,
        auth: {
          username: env.ELASTICSEARCH_LOG_USERNAME,
          password: env.ELASTICSEARCH_LOG_PASSWORD
        }
    }) ){

    //console.log(`HF envs: ${env.ELASTICSEARCH_LOG_ENABLED} | ${env.ELASTICSEARCH_LOG_SCHEME} | ${env.ELASTICSEARCH_LOG_HOST} | ${env.ELASTICSEARCH_LOG_PORT} | ${env.ELASTICSEARCH_LOG_INDEX}`);
    //console.log(`Delete -> Conversation ID: ${conversationId}`);

    // Create ElasticSearch Client
    try{
        
        await es_client.deleteByQuery({
            index: env.ELASTICSEARCH_LOG_INDEX,
            query: {
                term: {
                    "session_id": conversationId
                }
            },
            refresh: true,
        });

    }catch(e){
        console.error(e);
    }


}



/**
 * Update a message's Score in ElasticSearch
 */
export async function ESChatHistoryUpdateScore(
    conversationId: string,
    messageId: string,
	score: number){

    //console.log(`HF envs: ${env.ELASTICSEARCH_LOG_ENABLED} | ${env.ELASTICSEARCH_LOG_SCHEME} | ${env.ELASTICSEARCH_LOG_HOST} | ${env.ELASTICSEARCH_LOG_PORT} | ${env.ELASTICSEARCH_LOG_INDEX}`);
    //console.log(`Message ID: ${messageId} | Session ID: ${conversationId} | Score: ${score}`);

    
    await fetch(`${env.ELASTICSEARCH_LOG_SCHEME}://${env.ELASTICSEARCH_LOG_HOST}:${env.ELASTICSEARCH_LOG_PORT}/${env.ELASTICSEARCH_LOG_INDEX}/_update_by_query`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            "script": {
            "inline": `ctx._source.hf_score = '${score}'`,
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


}

