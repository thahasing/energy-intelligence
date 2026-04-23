from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.database import get_db, Project
import os
import httpx

chatbot_router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    reply: str

async def get_db_context(db):
    try:
        total = await db.execute(select(func.count(Project.id)))
        total_count = total.scalar()
        by_type = await db.execute(select(Project.project_type, func.count(Project.id)).group_by(Project.project_type))
        type_data = {row[0]: row[1] for row in by_type}
        return f"Total projects: {total_count}. By type: {type_data}"
    except:
        return "Database stats unavailable"

@chatbot_router.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    try:
        db_context = await get_db_context(db)
        system_prompt = f"You are an AI assistant for the Energy Project Intelligence Engine. {db_context}. Help users understand renewable energy projects from SEC EDGAR filings. Be concise and helpful."
        
        messages = [{"role": "system", "content": system_prompt}]
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        groq_key = os.environ.get("GROQ_API_KEY", "")
        
        if groq_key:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"},
                    json={"model": "llama-3.3-70b-versatile", "messages": messages, "max_tokens": 500},
                    timeout=30
                )
                data = response.json()
                reply = data["choices"][0]["message"]["content"]
                return ChatResponse(reply=reply)
        else:
            try:
                import ollama
                response = ollama.chat(model="llama3.2", messages=messages)
                return ChatResponse(reply=response["message"]["content"])
            except:
                return ChatResponse(reply="AI chat unavailable. Use Search and Dashboard to explore projects!")
    except Exception as e:
        return ChatResponse(reply=f"Chat error: {str(e)}")