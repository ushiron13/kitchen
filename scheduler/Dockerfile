FROM alpine:3.19
RUN apk add --no-cache curl sqlite bash tzdata
ENV TZ=Asia/Tokyo
COPY crontab /etc/crontabs/root
COPY scripts/ /scripts/
RUN chmod +x /scripts/*.sh
CMD ["crond", "-f", "-l", "2"]
