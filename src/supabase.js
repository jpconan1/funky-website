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

    const isImage = content.startsWith('data:image/');
    const isLoop = fileName.toLowerCase().endsWith('.loop');

    // Enforce character limits
    const MAX_TEXT_LENGTH = 5000;
    const MAX_IMAGE_LENGTH = 1048576; // 1MB
    const MAX_LOOP_LENGTH = 50000;

    if (isImage) {
        if (content.length > MAX_IMAGE_LENGTH) {
            throw new Error(`Image data is too large (${Math.round(content.length / 1024)}KB). Max is 1MB.`);
        }
    } else if (isLoop) {
        if (content.length > MAX_LOOP_LENGTH) {
            throw new Error(`Loop data is too large. Max is ${MAX_LOOP_LENGTH} characters.`);
        }
    } else {
        if (content.length > MAX_TEXT_LENGTH) {
            throw new Error(`Note is too long. Max is ${MAX_TEXT_LENGTH} characters.`);
        }
    }

    // We only sanitize if it's NOT an image. 
    // DOMPurify on a 1MB base64 string is extremely slow and can corrupt the image data.
    const sanitizedContent = isImage ? content : DOMPurify.sanitize(content);
    const sanitizedFileName = DOMPurify.sanitize(fileName);

    // Basic Validation: If it's a .draw file, it MUST be an image
    if (sanitizedFileName.toLowerCase().endsWith('.draw') && !isImage) {
        throw new Error('Security: .draw files must be valid image data.');
    }

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

export async function restoreMessage(messageId) {
    if (!supabase) return;
    console.log(`Restoring message: ${messageId}`);

    const { data: restored, error } = await supabase.rpc('restore_message', { message_id: messageId });

    if (error) {
        console.warn('RPC restoration failed:', error);
        // Fallback to direct update if RPC fails
        const { data: updateData, error: updateError } = await supabase
            .from('messages')
            .update({ is_binned: false })
            .eq('id', messageId)
            .select();

        if (updateError) {
            console.error('Direct restoration failed:', updateError);
            throw updateError;
        }
        return updateData;
    }

    return restored;
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
        .order('created_at', { ascending: false })
        .limit(50); // Prevent loading hundreds of MBs if spammed

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
        .order('created_at', { ascending: false })
        .limit(50);

    if (error) {
        console.error('Error fetching binned messages:', error);
        return [];
    }
    return data;
}
