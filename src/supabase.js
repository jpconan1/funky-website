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

export async function binMessage(messageId) {
    if (!supabase) return;
    console.log(`Binning message: ${messageId}`);

    const { data: updated, error } = await supabase.rpc('bin_message', { message_id: messageId });

    if (error) {
        console.warn('RPC failed:', error);
        const { data: updateData, error: updateError } = await supabase
            .from('messages')
            .update({ is_binned: true, bin_count: 1 })
            .eq('id', messageId)
            .select();

        if (updateError) {
            console.error('Direct binning failed:', updateError);
            throw updateError;
        }
        return updateData;
    }

    if (updated === false) {
        console.error(`Database found NO record for ID ${messageId}! Binning failed.`);
    } else {
        console.log('Successfully binned in DB');
    }
    return updated;
}

export async function deleteMessagePermanently(messageId) {
    if (!supabase) return;

    const { data, error } = await supabase
        .from('messages')
        .delete()
        .eq('id', messageId);

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
        .or('is_binned.eq.false,is_binned.is.null')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching guestbook messages:', error);
        return [];
    }
    return data;
}

export async function getBinnedMessages() {
    if (!supabase) return [];

    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('is_binned', true)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching binned messages:', error);
        return [];
    }
    return data;
}
