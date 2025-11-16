import { Agent, run, tool} from '@openai/agents'
import {z} from 'zod'
import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()
const getWeatherDataSchema = z.object({
    city: z.string().describe('The city to get the weather data for'),
    country: z.string().describe('The country to get the weather data for'),
    degree: z.number().describe('The degree to get the weather data for'),
    condition: z.string().describe('The condition to get the weather data for'),
})

const GetWeatherData = tool({
    name: 'GetWeatherData',
    description: 'Get the weather data for a given city', 
    parameters: getWeatherDataSchema,
    execute: async ({city, country}) => {
        if (!process.env.OPENWEATHER_API_KEY) {
            throw new Error('OPENWEATHER_API_KEY is not set in environment variables')
        }
        const query = country ? `${city},${country}` : city
        // Add &units=metric to get temperature in Celsius
        const response = await axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${query}&units=metric&appid=${process.env.OPENWEATHER_API_KEY}`)
        
        // Extract and format the data to match the schema
        const weatherData = response.data
        return {
            city: weatherData.name,
            country: weatherData.sys.country,
            degree: Math.round(weatherData.main.temp), // Temperature in Celsius
            condition: weatherData.weather[0].description,
            // Include full data for more context
            fullData: {
                temperature: weatherData.main.temp,
                feelsLike: weatherData.main.feels_like,
                humidity: weatherData.main.humidity,
                pressure: weatherData.main.pressure,
                description: weatherData.weather[0].description,
                windSpeed: weatherData.wind?.speed || 0
            }
        }
    },
})
const sendsEmail = tool({
    name: 'sendsEmail',
    description: 'Send an email to a given email address',
    parameters: z.object({
        email: z.string().describe('The email address to send the email to'),
        subject: z.string().describe('The subject of the email'),
        body: z.string().describe('The body of the email'),
    }),
    execute: async ({email, subject, body}) => {
        const response = await axios.post(`https://api.emailjs.com/api/v1.0/email/send`, {email, subject, body})
        return response.data
    },
})

const agent = new Agent({
    name: 'Weather Agent',
    description: 'A agent that gets the weather data for a given city',
    tools: [GetWeatherData, sendsEmail],
    
    outputType: getWeatherDataSchema,
})

async function main(query = 'what is weather in india') {
    try {
        const result = await run(agent, query);
        
        // Try to get the tool output with actual weather data
        const toolOutputs = result.state._generatedItems.filter(item => 
            item.type === 'tool_call_output'
        );
        
        if (toolOutputs.length > 0) {
            const weatherData = toolOutputs[0].output;
            console.log('\n=== Current Weather ===');
            console.log(`City: ${weatherData.city}, ${weatherData.country}`);
            console.log(`Temperature: ${weatherData.degree}°C`);
            console.log(`Condition: ${weatherData.condition}`);
            if (weatherData.fullData) {
                console.log(`Feels Like: ${Math.round(weatherData.fullData.feelsLike)}°C`);
                console.log(`Humidity: ${weatherData.fullData.humidity}%`);
            }
            console.log('\n=== Full Weather Data ===');
            console.log(JSON.stringify(weatherData, null, 2));
        } else {
            // Fallback to final output
            console.log('\n=== Agent Response ===');
            console.log(result.finalOutput || result.state._currentStep.output);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

main().catch(console.error);
