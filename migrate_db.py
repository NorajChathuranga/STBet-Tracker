import os
import sqlite3
import json
import csv
from datetime import datetime

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(WORKSPACE_DIR, 'stbet_results.db')
DATA_DIR = os.path.join(WORKSPACE_DIR, 'data')

MEETINGS_JSON = os.path.join(DATA_DIR, 'meetings.json')
SUMMARY_JSON = os.path.join(DATA_DIR, 'summary.json')
DETAILS_JSON = os.path.join(DATA_DIR, 'details.json')

def parse_summary_row(meeting):
    meeting_name = meeting.get('meetingName', 'Unknown Match')
    meeting_date = meeting.get('meetingDate', '')
    meeting_time = meeting.get('meetingTime', '')
    meeting_code = meeting.get('meetingCode', '')
    
    match_info = {
        'date': meeting_date,
        'time': meeting_time,
        'match_name': meeting_name,
        'winner': 'N/A',
        'first_ball_1st_innings': 'N/A',
        'first_ball_2nd_innings': 'N/A',
        'total_runs_ou': 'N/A',
        'total_4s_ou': 'N/A',
        'total_6s_ou': 'N/A',
        'most_4s': 'N/A',
        'most_6s': 'N/A',
        'wickets_lost_ou': 'N/A',
        'meeting_code': meeting_code
    }
    
    for event in meeting.get('events', []):
        event_name = event.get('eventName', '')
        event_positions = event.get('eventPositions', [])
        
        winning_selections = [pos.get('selectionName', '') for pos in event_positions if pos.get('resultPosition') == 1]
        winner_str = ", ".join(winning_selections) if winning_selections else 'N/A'
        
        if not winner_str or winner_str == 'N/A':
            continue
            
        if event_name == 'Match Result':
            match_info['winner'] = winner_str
        elif event_name == '1st Innings 1st Ball Outcome':
            match_info['first_ball_1st_innings'] = winner_str
        elif event_name == '2nd Innings 1st Ball Outcome':
            match_info['first_ball_2nd_innings'] = winner_str
        elif 'Total Match Runs Over/Under' in event_name:
            match_info['total_runs_ou'] = f"{event_name.split(' ')[-1]} - {winner_str}"
        elif 'Total Match 4s Over/Under' in event_name:
            match_info['total_4s_ou'] = f"{event_name.split(' ')[-1]} - {winner_str}"
        elif 'Total Match 6s Over/Under' in event_name:
            match_info['total_6s_ou'] = f"{event_name.split(' ')[-1]} - {winner_str}"
        elif 'Innings most 4s' in event_name:
            match_info['most_4s'] = winner_str
        elif 'Innings most 6s' in event_name:
            match_info['most_6s'] = winner_str
        elif 'Match wickets lost Over/Under' in event_name:
            match_info['wickets_lost_ou'] = f"{event_name.split(' ')[-1]} - {winner_str}"
            
    return match_info

def parse_detail_rows(meeting):
    meeting_name = meeting.get('meetingName', 'Unknown Match')
    meeting_date = meeting.get('meetingDate', '')
    meeting_time = meeting.get('meetingTime', '')
    meeting_code = meeting.get('meetingCode', '')
    
    rows = []
    for event in meeting.get('events', []):
        event_id = event.get('eventId', '')
        event_name = event.get('eventName', '')
        
        for pos in event.get('eventPositions', []):
            rows.append({
                'date': meeting_date,
                'time': meeting_time,
                'match_name': meeting_name,
                'meeting_code': meeting_code,
                'event_id': event_id,
                'event_name': event_name,
                'selection_number': pos.get('selectionNumber', ''),
                'selection_name': pos.get('selectionName', ''),
                'result_position': pos.get('resultPosition', ''),
                'win_amount': pos.get('winAmount', ''),
                'last_odd': pos.get('lastOdd', '')
            })
    return rows

def main():
    if not os.path.exists(DATA_DIR):
        os.makedirs(DATA_DIR)
        print(f"Created data directory: {DATA_DIR}")
        
    if not os.path.exists(DB_PATH):
        print(f"SQLite DB not found at {DB_PATH}. Exiting migration.")
        return
        
    print(f"Reading from database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT raw_json FROM meetings')
    rows = cursor.fetchall()
    conn.close()
    
    print(f"Found {len(rows)} meetings. Parsing...")
    meetings_list = []
    for row in rows:
        try:
            meetings_list.append(json.loads(row[0]))
        except Exception as e:
            print(f"Error parsing row: {e}")
            
    # Sort meetings by date and time
    meetings_list.sort(key=lambda x: (x.get('meetingDate', ''), x.get('meetingTime', '')))
    
    # Save raw meetings
    meetings_dict = {m.get('meetingCode'): m for m in meetings_list if m.get('meetingCode')}
    with open(MEETINGS_JSON, 'w', encoding='utf-8') as f:
        json.dump(meetings_dict, f, indent=2)
    print(f"Saved {len(meetings_dict)} meetings to {MEETINGS_JSON}")
    
    # Build summary and details lists
    summaries = []
    details = []
    
    for meeting in meetings_list:
        summaries.append(parse_summary_row(meeting))
        details.extend(parse_detail_rows(meeting))
        
    with open(SUMMARY_JSON, 'w', encoding='utf-8') as f:
        json.dump(summaries, f, indent=2)
    print(f"Saved {len(summaries)} summaries to {SUMMARY_JSON}")
    
    with open(DETAILS_JSON, 'w', encoding='utf-8') as f:
        json.dump(details, f, indent=2)
    print(f"Saved {len(details)} details to {DETAILS_JSON}")
    
    print("Migration finished successfully!")

if __name__ == '__main__':
    main()
