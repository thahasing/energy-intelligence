from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.database import get_db, Project

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
        import ollama
        db_context = await get_db_context(db)
        system_prompt = f"You are an AI assistant for the Energy Project Intelligence Engine. {db_context}. Help users understand renewable energy projects from SEC EDGAR filings."
        messages = [{"role": "system", "content": system_prompt}]
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        response = ollama.chat(model="llama3.2", messages=messages)
        return ChatResponse(reply=response["message"]["content"])
    except ImportError:
        return ChatResponse(reply="AI chat requires Ollama running locally. The dashboard works fully - use Search to find projects!")
    except Exception as e:
        return ChatResponse(reply="Chat unavailable in production. Use the Search and Dashboard features!")