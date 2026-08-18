package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type ClientMessage struct {
	ID        string `json:"id"`
	HWID      string `json:"hwid"`
	Sender    string `json:"sender"`
	Message   string `json:"message"`
	CreatedAt string `json:"created_at"`
	IsRead    bool   `json:"is_read"`
}

// GetClientMessages fetches the chat history between this machine and the admin.
func (a *App) GetClientMessages() ([]ClientMessage, error) {
	hwid := a.GetHWID()
	reqURL := fmt.Sprintf("%s?action=client_get_messages&hwid=%s&nocache=%d",
		LICENSE_API_URL, url.QueryEscape(hwid), time.Now().Unix())

	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(reqURL)
	if err != nil {
		return nil, fmt.Errorf("không thể kết nối máy chủ tin nhắn: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var list []ClientMessage
	if err := json.Unmarshal(body, &list); err != nil {
		return []ClientMessage{}, nil
	}
	return list, nil
}

// SendClientMessage sends a reply from this client back to the admin.
func (a *App) SendClientMessage(text string) error {
	text = strings.TrimSpace(text)
	if text == "" {
		return fmt.Errorf("tin nhắn không được để trống")
	}

	hwid := a.GetHWID()
	reqURL := fmt.Sprintf("%s?action=client_send_message&hwid=%s&message=%s&nocache=%d",
		LICENSE_API_URL, url.QueryEscape(hwid), url.QueryEscape(text), time.Now().Unix())

	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(reqURL)
	if err != nil {
		return fmt.Errorf("gửi tin nhắn thất bại: %w", err)
	}
	defer resp.Body.Close()

	return nil
}

// MarkClientMessagesRead marks admin messages as read for this client.
func (a *App) MarkClientMessagesRead() error {
	hwid := a.GetHWID()
	reqURL := fmt.Sprintf("%s?action=client_mark_read&hwid=%s&nocache=%d",
		LICENSE_API_URL, url.QueryEscape(hwid), time.Now().Unix())

	client := http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(reqURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// PollAdminMessages checks for new unread admin messages and emits an event to UI.
func (a *App) PollAdminMessages() {
	msgs, err := a.GetClientMessages()
	if err != nil || len(msgs) == 0 {
		return
	}

	hasUnreadAdmin := false
	for _, m := range msgs {
		if m.Sender == "admin" && !m.IsRead {
			hasUnreadAdmin = true
			break
		}
	}

	if hasUnreadAdmin {
		wailsRuntime.EventsEmit(a.ctx, "admin_message_received", msgs)
	}
}
