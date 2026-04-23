
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.models.database import get_db, Project
import ollama

chatbot_router = APIRouter()

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]

class ChatResponse(BaseModel):
    reply: str

async def get_db_context(db: AsyncSession) -> str:
    try:
        total = await db.execute(select(func.count(Project.id)))
        total_count = total.scalar()
        
        by_type = await db.execute(
            select(Project.project_type, func.count(Project.id))
            .group_by(Project.project_type)
        )
        type_data = {row[0]: row[1] for row in by_type}
        
        by_state = await db.execute(
            select(Project.state, func.count(Project.id))
            .group_by(Project.state)
            .order_by(func.count(Project.id).desc())
            .limit(5)
        )
        state_data = {row[0]: row[1] for row in by_state}
        
        by_lifecycle = await db.execute(
            select(Project.lifecycle_stage, func.count(Project.id))
            .group_by(Project.lifecycle_stage)
        )
        lifecycle_data = {row[0]: row[1] for row in by_lifecycle}
        
        return f"""
Current database stats:
- Total projects: {total_count}
- By type: {type_data}
- Top states: {state_data}
- By lifecycle: {lifecycle_data}
        """
    except:
        return "Database stats unavailable"

@chatbot_router.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    try:
        db_context = await get_db_context(db)
        
        system_prompt = f"""You are an AI assistant for the Energy Project Intelligence Engine.
This platform extracts renewable energy project data from SEC EDGAR filings.

{db_context}

You help users understand:
- Renewable energy projects (solar, wind, battery, hydro, geothermal)
- Project locations, capacities in MW, lifecycle stages
- ERCOT region (Texas grid) and MISO region (Midwest grid)
- Environmental approvals, grid connections, financing status
- How to use the dashboard, search, and ingestion features
- SEC EDGAR filings and how data is extracted

Be concise, data-driven, and professional. Use the database stats above to give accurate answers.
When users ask about specific projects, tell them to use the Search page.
When users ask about adding more data, tell them to use the Ingest page."""

        messages = [{"role": "system", "content": system_prompt}]
        for msg in request.messages:
            messages.append({"role": msg.role, "content": msg.content})
        
        response = ollama.chat(model="llama3.2", messages=messages)
        return ChatResponse(reply=response["message"]["content"])
    
    except Exception as e:
        return ChatResponse(reply=f"I am having trouble connecting to my AI engine. Please make sure Ollama is running. Error: {str(e)}")
