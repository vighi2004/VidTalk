import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../contexts/AuthContext'
import { useNavigate } from 'react-router-dom';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';
import { IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Box } from '@mui/material';

export default function History() {
    const { getHistoryOfUser } = useContext(AuthContext);
    const [meetings, setMeetings] = useState([])

    const [previewOpen, setPreviewOpen] = useState(false);
    const [previewImg, setPreviewImg] = useState(null);
    const [previewTitle, setPreviewTitle] = useState('');

    const routeTo = useNavigate();

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const history = await getHistoryOfUser();
                setMeetings(history || []);
            } catch {
                // implement snackbar if needed
            }
        }
        fetchHistory();
    }, [])

    let formatDate = (dateString) => {
        const date = new Date(dateString);
        const day = date.getDate().toString().padStart(2, "0");
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear();
        return `${day}/${month}/${year}`
    }

    const wbIndexKey = (code) => `wb:index:${code}`;
    const wbItemKey = (code, id) => `wb:item:${code}:${id}`;

    const hasWhiteboard = (code) => {
        try {
            const idx = JSON.parse(localStorage.getItem(wbIndexKey(code)) || '[]');
            return Array.isArray(idx) && idx.length > 0;
        } catch { return false; }
    };

    const openLatestWhiteboard = (code) => {
        try {
            const idx = JSON.parse(localStorage.getItem(wbIndexKey(code)) || '[]');
            if (!idx || !idx.length) return;
            const lastId = idx[idx.length - 1];
            const item = JSON.parse(localStorage.getItem(wbItemKey(code, lastId)) || 'null');
            if (item && item.snapshot) {
                setPreviewTitle(`Whiteboard • ${code}`);
                setPreviewImg(item.snapshot);
                setPreviewOpen(true);
            }
        } catch {}
    };

    return (
        <div>
            <IconButton onClick={() => routeTo("/home")}>
                <HomeIcon />
            </IconButton>

            {meetings && meetings.length ? meetings.map((e, i) => {
                const code = e.meetingCode;
                const wbAvailable = hasWhiteboard(code);
                return (
                    <Card key={i} variant="outlined" sx={{ mb: 2 }}>
                        <CardContent>
                            <Typography sx={{ fontSize: 14 }} color="text.secondary" gutterBottom>
                                Code: {code}
                            </Typography>
                            <Typography sx={{ mb: 1.5 }} color="text.secondary">
                                Date: {formatDate(e.date)}
                            </Typography>

                            {wbAvailable ? (
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Button size="small" variant="contained" onClick={() => openLatestWhiteboard(code)}>
                                        View Whiteboard
                                    </Button>
                                </Box>
                            ) : (
                                <Typography sx={{ fontSize: 12 }} color="text.secondary">
                                    No whiteboard for this meeting
                                </Typography>
                            )}
                        </CardContent>
                    </Card>
                )
            }) : null}

            <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="lg" fullWidth>
                <DialogTitle>{previewTitle}</DialogTitle>
                <DialogContent dividers>
                    {previewImg ? (
                        <img src={previewImg} alt="whiteboard" style={{ width: '100%', height: 'auto' }} />
                    ) : (
                        <Typography>No preview available</Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPreviewOpen(false)} variant="contained">Close</Button>
                </DialogActions>
            </Dialog>
        </div>
    )
}