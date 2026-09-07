package com.nearby.pro.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.nearby.pro.entity.User;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

public interface UserMapper extends BaseMapper<User> {

    @Select("SELECT * FROM users WHERE openid = #{openid} LIMIT 1")
    User selectByOpenid(@Param("openid") String openid);
}
