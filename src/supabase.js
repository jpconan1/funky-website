import { createClient } from '@supabase/supabase-js';
import DOMPurify from 'dompurify';

// These will be filled in by the user after they set up Supabase
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
    console.warn('Supabase URL or Key missing. Guestbook features will not work.');
}

export const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

export async function saveMessage(fileName, content) {
    if (!supabase) {
        throw new Error('Supabase is not initialized. Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file and restart your dev server.');
    }

    const sanitizedContent = DOMPurify.sanitize(content);
    const sanitizedFileName = DOMPurify.sanitize(fileName);

    const { data, error } = await supabase
        .from('messages')
        .insert([
            {
                filename: sanitizedFileName,
                content: sanitizedContent
            }
        ]);

    if (error) throw error;
    return data;
}

export async function getMessages() {
    if (!supabase) {
        // Return empty array if not configured, rather than crashing
        console.warn('Attempted to fetch messages but Supabase is not configured.');
        return [];
    }

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
}
