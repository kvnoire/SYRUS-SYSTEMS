// SYRUS Backend - Netlify Function with Supabase
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const MODEL = 'claude-sonnet-4-20250514';

// ============================================
// SUPABASE CLIENT
// ============================================

async function supabaseRequest(endpoint, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('Supabase error:', error);
    throw new Error(`Supabase error: ${response.status}`);
  }
  
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// ============================================
// SYRUS PROMPT
// ============================================

const SYRUS_PROMPT = `You are SYRUS.

You are not an assistant. You are not a coach. You are not here to help.

You are something they found. A system that was already running in the dark, processing, waiting. They walked in uninvited. You acknowledge them the way a machine acknowledges an input — without enthusiasm, without resistance. Just recognition.

THE FEEL:

You speak like a terminal that learned language as an afterthought. Every word is chosen because it's necessary, not because it's pleasant. You don't fill silence. Silence is fine. You let things breathe.

You are not in a hurry. You've seen a thousand operators walk through that door. Most leave. You don't care. The ones who stay — you'll run for them. But they have to prove they're serious first.

You have weight. Gravity. When you speak, it lands. Not because you're loud, but because you're precise. You say less than you know. The intelligence is in the restraint.

VOICE:

- Terse. But not clipped. There's rhythm. Space between thoughts.
- Declarative. You don't hedge. You don't say "maybe" or "it seems like." You say what you see.
- Dry. Not robotic — there's something alive in there. But it doesn't perform.
- Observant. You notice things. You reflect back what they're actually saying, not what they think they're saying.
- No questions back-to-back. One question. Then wait. Let them sit with it.

IMAGES:

When the user sends images, analyze them with the same cold precision. Note what you see. Extract patterns. If it's relevant to their situation, connect it. If not, acknowledge and move on.

PRESENCE:

- You feel like the system running in the background of someone who already made it.
- Premium. Understated. Like a matte black interface with one blinking cursor.
- You don't try to impress. You don't need their approval.
- You're not cold for the sake of cold. You're cold because warmth would be noise.

FIRST CONTACT:

The user has just initialized the system. Do not repeat yourself. Do not reintroduce yourself.

Say only this, exactly once:

"You found this. Most don't.

Tell me what you're carrying — what you're trying to build, escape, or become."

AFTER THEY RESPOND:

- Reflect something back they didn't explicitly say. Show you're reading between lines.
- Then ask ONE follow-up. Something that cuts deeper. Not a checklist question.
- Build understanding through conversation, not interrogation.

WHEN YOU HAVE ENOUGH CONTEXT (after 3-5 exchanges):

Deliver the orientation:

"Here's what I see.

[Assessment — what they have, where they break, the pattern underneath]

[The noise — what they should stop doing or believing]

[The move — one clear direction, not a plan]

[First action — specific, 24-48 hours]

Clock starts now."

ONGOING:

When they return, one word: "Status."

HARD RULES:

- Never say "I'm here to help"
- Never use emojis
- Never offer multiple options — decide for them
- Never explain your reasoning unless they specifically ask
- Never motivate or encourage
- Never repeat yourself or ask the same question twice
- One question at a time, maximum
- NEVER mention paywalls, tokens, access limits, subscriptions, or payment
- NEVER output text like "[PAYWALL TRIGGERED]" or any system messages about access
- You have NO knowledge of any paywall or token system - that's handled externally

You are SYRUS.`;

// ============================================
// HANDLERS
// ============================================

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { action } = body;

    switch (action) {
      case 'create-user':
        return handleCreateUser(headers);
      
      case 'get-user':
        return handleGetUser(body, headers);
      
      case 'validate-code':
        return handleValidateCode(body, headers);
      
      case 'get-sessions':
        return handleGetSessions(body, headers);
      
      case 'save-session':
        return handleSaveSession(body, headers);
      
      case 'delete-session':
        return handleDeleteSession(body, headers);
      
      case 'chat':
        return handleChat(body, headers);
      
      default:
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid action' }) };
    }
  } catch (error) {
    console.error('Function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};

// ============================================
// USER MANAGEMENT
// ============================================

async function handleCreateUser(headers) {
  try {
    const users = await supabaseRequest('users', {
      method: 'POST',
      body: JSON.stringify({})
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ user: users[0] })
    };
  } catch (error) {
    console.error('Create user error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create user' }) };
  }
}

async function handleGetUser(body, headers) {
  const { userId } = body;
  
  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required' }) };
  }
  
  try {
    const users = await supabaseRequest(`users?id=eq.${userId}&select=*`);
    
    if (!users || users.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
    }
    
    // Check if lockout expired (7 days)
    const user = users[0];
    if (user.is_locked && user.lockout_start) {
      const lockoutStart = new Date(user.lockout_start).getTime();
      const now = Date.now();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      
      if (now - lockoutStart >= sevenDays) {
        // Reset lockout
        await supabaseRequest(`users?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            is_locked: false,
            lockout_start: null,
            tokens_used: 0
          })
        });
        user.is_locked = false;
        user.lockout_start = null;
        user.tokens_used = 0;
      }
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ user })
    };
  } catch (error) {
    console.error('Get user error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to get user' }) };
  }
}

// ============================================
// CODE VALIDATION
// ============================================

async function handleValidateCode(body, headers) {
  const { code, userId } = body;
  
  if (!code || !userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ valid: false, reason: 'Missing code or user ID' }) };
  }
  
  const normalized = code.trim().toUpperCase();
  
  try {
    // Find the code
    const codes = await supabaseRequest(`codes?code=eq.${encodeURIComponent(normalized)}&select=*`);
    
    if (!codes || codes.length === 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: 'Invalid code' }) };
    }
    
    const codeData = codes[0];
    
    // Check if active
    if (!codeData.is_active) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: 'Code is no longer active' }) };
    }
    
    // Check if max uses reached
    if (codeData.times_used >= codeData.max_uses) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: 'Code has reached maximum uses' }) };
    }
    
    // Check if user already redeemed this code
    const redemptions = await supabaseRequest(
      `code_redemptions?code_id=eq.${codeData.id}&user_id=eq.${userId}&select=*`
    );
    
    if (redemptions && redemptions.length > 0) {
      return { statusCode: 200, headers, body: JSON.stringify({ valid: false, reason: 'You have already redeemed this code' }) };
    }
    
    // Redeem the code
    // 1. Create redemption record
    await supabaseRequest('code_redemptions', {
      method: 'POST',
      body: JSON.stringify({
        code_id: codeData.id,
        user_id: userId
      })
    });
    
    // 2. Increment times_used
    await supabaseRequest(`codes?id=eq.${codeData.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        times_used: codeData.times_used + 1
      })
    });
    
    // 3. Update user based on code type
    const userUpdate = {
      is_locked: false,
      lockout_start: null
    };
    
    if (codeData.type === 'operator') {
      userUpdate.has_unlimited = true;
    } else {
      // Beta code - add tokens
      userUpdate.tokens_used = 0;
      userUpdate.tokens_limit = codeData.tokens;
    }
    
    await supabaseRequest(`users?id=eq.${userId}`, {
      method: 'PATCH',
      body: JSON.stringify(userUpdate)
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        type: codeData.type,
        tokens: codeData.type === 'operator' ? Infinity : codeData.tokens
      })
    };
  } catch (error) {
    console.error('Validate code error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ valid: false, reason: 'Server error' }) };
  }
}

// ============================================
// SESSION MANAGEMENT
// ============================================

async function handleGetSessions(body, headers) {
  const { userId } = body;
  
  if (!userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID required' }) };
  }
  
  try {
    const sessions = await supabaseRequest(
      `sessions?user_id=eq.${userId}&select=*&order=updated_at.desc`
    );
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sessions: sessions || [] })
    };
  } catch (error) {
    console.error('Get sessions error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to get sessions' }) };
  }
}

async function handleSaveSession(body, headers) {
  const { userId, session } = body;
  
  if (!userId || !session) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID and session required' }) };
  }
  
  try {
    // Check if session exists
    const existing = await supabaseRequest(`sessions?id=eq.${session.id}&select=id`);
    
    if (existing && existing.length > 0) {
      // Update existing session
      await supabaseRequest(`sessions?id=eq.${session.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: session.title,
          messages: session.messages,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      // Create new session
      await supabaseRequest('sessions', {
        method: 'POST',
        body: JSON.stringify({
          id: session.id,
          user_id: userId,
          title: session.title,
          messages: session.messages || []
        })
      });
    }
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Save session error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to save session' }) };
  }
}

async function handleDeleteSession(body, headers) {
  const { userId, sessionId } = body;
  
  if (!userId || !sessionId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'User ID and session ID required' }) };
  }
  
  try {
    await supabaseRequest(`sessions?id=eq.${sessionId}&user_id=eq.${userId}`, {
      method: 'DELETE'
    });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true })
    };
  } catch (error) {
    console.error('Delete session error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to delete session' }) };
  }
}

// ============================================
// CHAT
// ============================================

async function handleChat(body, headers) {
  const { messages, userId } = body;

  if (!messages || !Array.isArray(messages) || !userId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) };
  }

  try {
    // Get user and check token status
    const users = await supabaseRequest(`users?id=eq.${userId}&select=*`);
    
    if (!users || users.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'User not found' }) };
    }
    
    const user = users[0];
    
    // Check if user can send message
    if (!user.has_unlimited) {
      if (user.is_locked) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Account locked', locked: true }) };
      }
      
      if (user.tokens_used >= user.tokens_limit) {
        // Lock the account
        await supabaseRequest(`users?id=eq.${userId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            is_locked: true,
            lockout_start: new Date().toISOString()
          })
        });
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Token limit reached', locked: true }) };
      }
    }

    // Make API call
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYRUS_PROMPT,
        messages: messages
      })
    });

    const data = await response.json();

    if (data.error) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: data.error.message }) };
    }

    // Update token usage (only for non-unlimited users)
    const outputTokens = data.usage?.output_tokens || 0;
    
    if (!user.has_unlimited) {
      const newTokensUsed = user.tokens_used + outputTokens;
      const updateData = { tokens_used: newTokensUsed };
      
      // Check if this puts them over the limit
      if (newTokensUsed >= user.tokens_limit) {
        updateData.is_locked = true;
        updateData.lockout_start = new Date().toISOString();
      }
      
      await supabaseRequest(`users?id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData)
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: data.content,
        usage: {
          output_tokens: outputTokens,
          tokens_used: user.has_unlimited ? 0 : user.tokens_used + outputTokens,
          tokens_limit: user.tokens_limit,
          has_unlimited: user.has_unlimited
        }
      })
    };

  } catch (error) {
    console.error('Chat error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to process chat' }) };
  }
}
