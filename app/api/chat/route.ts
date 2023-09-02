import { DynamicTool, DynamicStructuredTool } from 'langchain/tools' //allows for creation of custom tools
import { ChatOpenAI } from "langchain/chat_models/openai" //allows for use of OpenAI model in the chat
import { initializeAgentExecutorWithOptions } from "langchain/agents" //set up the agent executor
import { WikipediaQueryRun } from 'langchain/tools' //allows for fetching info from wikipedia
import { StreamingTextResponse } from 'ai' //allows for streaming text response
import * as z from 'zod' //zod library for schema validation

export const runtime = 'edge' //specify execution runtime as 'edge'

//define the POST method to handle incoming requests
export async function POST(req: Request, res: Response) {
  //extract message data from incoming request
  const { messages } = await req.json()
  //initialize the ChatOpenAI model
  const model = new ChatOpenAI({ temperature: 0, streaming: true })
  //set up wikipedia query tool for fetching information
  //this can be swapped out for any of the built in langchain tools
  const wikipediaQuery = new WikipediaQueryRun({
    topKResults: 1,
    maxDocContentLength: 300,
  })
  //how to make a custom tool
  const myTool = new DynamicTool ({
    name: 'myTool',
    description: 'explain here what the tool does because that is how the llm will know if they should use it',
    func: async () => {
      //tell it what you want it to do when it uses this tool
      console.log('Triggered myTool function')
      return 'The value of this function depends on what you tell it to do'
    }
  })

  //define a structured tool to fetch cryptocurrency prices from CoinGecko API
  const fetchCryptoPrice = new DynamicStructuredTool({
    name: 'fetchCryptoPrice',
    description: 'Fetches the current price of a specified cryptocurrency',
    schema: z.object({
      cryptoName: z.string(),
      vsCurrency: z.string().optional().default('USD'),
    }),
    func: async (options) => {
      console.log('Triggered fetchCryptoPrice function with options: ', options);
      const { cryptoName, vsCurrency } = options;
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${cryptoName}&vs_currencies=${vsCurrency}`;
      const response = await fetch(url);
      const data = await response.json();
      return data[cryptoName.toLowerCase()][vsCurrency.toLowerCase()].toString();
    },
  });

  //List all the tools that will be used by the agent during execution
  const tools = [wikipediaQuery, myTool, fetchCryptoPrice]
  //initialize the agent executor
  const executor = await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "openai-functions",
  })
  // 11. Extract the most recent input message from the array of messages
  const input = messages[messages.length - 1].content;

  // 12. Execute the agent with the provided input to get a response
  const result = await executor.run(input);

  // 13. Break the result into individual word chunks for streaming
  const chunks = result.split(" ");

  // 14. Define the streaming mechanism to send chunks of data to the client
  const responseStream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        const bytes = new TextEncoder().encode(chunk + " ");
        controller.enqueue(bytes);
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 20 + 10)));
      }
      controller.close();
    },
  });

  // 15. Send the created stream as a response to the client
  return new StreamingTextResponse(responseStream)
}



