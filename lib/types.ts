export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_online: boolean;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type Conversation = {
  id: string;
  name: string | null;
  is_group: boolean;
  avatar_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  last_message?: Message | null;
  other_user?: Profile | null;
  unread_count?: number;
};

export type ConversationMember = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'admin' | 'member';
  joined_at: string;
  profile?: Profile;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  message_type: 'text' | 'image' | 'file' | 'audio';
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  is_edited: boolean;
  is_deleted: boolean;
  reply_to_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  sender?: Profile;
  reply_to?: Message | null;
};
